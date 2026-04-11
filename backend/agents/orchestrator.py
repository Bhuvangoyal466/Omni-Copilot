from __future__ import annotations

import re
import warnings
from dataclasses import dataclass
from typing import cast

# Keep compatibility with environments where langchain no longer exposes
# module-level debug/verbose attributes expected by older integrations.
try:
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        import langchain  # type: ignore[import-not-found]

    module_dict = getattr(langchain, "__dict__", {})
    if "debug" not in module_dict:
        setattr(langchain, "debug", False)
    if "verbose" not in module_dict:
        setattr(langchain, "verbose", False)
except Exception:
    pass

from langgraph.graph import END, START, StateGraph

from agents.browser_agent import BrowserAgent
from agents.chat_agent import ChatAgent
from agents.calendar_agent import CalendarAgent
from agents.code_agent import CodeAgent
from agents.comms_agent import CommsAgent
from agents.docs_agent import DocsAgent
from agents.memory_agent import MemoryAgent
from agents.types import AgentOutput, AgentRoute, GraphState


docs_agent = DocsAgent()
chat_agent = ChatAgent()
comms_agent = CommsAgent()
calendar_agent = CalendarAgent()
code_agent = CodeAgent()
browser_agent = BrowserAgent()
memory_agent = MemoryAgent()

ACTION_ROUTES: set[AgentRoute] = {"docs", "comms", "calendar", "code", "browser", "memory"}
APPROVAL_WORDS = {"go", "yes", "proceed", "do it", "haan", "kr do", "haa"}
CANCEL_WORDS = {"cancel", "abort", "stop"}
DIRECT_ANSWER_PHRASES = {
    "just answer",
    "no plan needed",
    "without plan",
    "skip plan",
}
IRREVERSIBLE_KEYWORDS = {
    "send",
    "delete",
    "remove",
    "submit",
    "push",
    "merge",
    "publish",
    "transfer",
    "pay",
}


@dataclass
class PendingPlan:
    request: str
    route: AgentRoute
    plan_text: str
    steps: list[str]
    tools: list[str]
    estimated: str
    risk: str


PENDING_PLANS: dict[str, PendingPlan] = {}
LAST_LOCAL_OPEN_REQUESTS: dict[str, str] = {}


def _normalize_message(message: str) -> str:
    lowered = message.strip().lower()
    lowered = re.sub(r"\s+", " ", lowered)
    return lowered


def _extract_change_request(message: str) -> str | None:
    match = re.match(r"^\s*change\s*:\s*(.+)$", message, flags=re.IGNORECASE | re.DOTALL)
    if not match:
        return None
    change_text = match.group(1).strip()
    return change_text or None


def _is_approval(message: str) -> bool:
    normalized = re.sub(r"[^a-zA-Z\s]", "", _normalize_message(message))
    return normalized in APPROVAL_WORDS


def _is_cancel(message: str) -> bool:
    normalized = re.sub(r"[^a-zA-Z\s]", "", _normalize_message(message))
    return normalized in CANCEL_WORDS


def _is_action_route(route: AgentRoute) -> bool:
    return route in ACTION_ROUTES


def _wants_direct_answer(message: str) -> bool:
    normalized = _normalize_message(message)
    return any(phrase in normalized for phrase in DIRECT_ANSWER_PHRASES)


def _plan_blueprint(route: AgentRoute) -> tuple[list[str], list[str], str]:
    if route == "docs":
        return (
            [
                "[orchestrator] -> classify request and document scope",
                "[docs_agent] -> search Google Drive and local files",
                "[docs_agent] -> summarize findings with next action",
            ],
            ["docs_agent", "search_drive_files", "search_local_files"],
            "~3 actions, ~10 seconds",
        )
    if route == "comms":
        return (
            [
                "[orchestrator] -> classify communication request",
                "[comms_agent] -> scan Gmail and Slack matches",
                "[comms_agent] -> build concise communication digest",
            ],
            ["comms_agent", "search_gmail_threads", "search_slack_messages"],
            "~3 actions, ~10 seconds",
        )
    if route == "calendar":
        return (
            [
                "[orchestrator] -> classify calendar request",
                "[calendar_agent] -> fetch relevant upcoming events",
                "[calendar_agent] -> return schedule summary",
            ],
            ["calendar_agent", "list_upcoming_events"],
            "~3 actions, ~10 seconds",
        )
    if route == "code":
        return (
            [
                "[orchestrator] -> classify code request",
                "[code_agent] -> search pull requests and code context",
                "[code_agent] -> return review-ready summary",
            ],
            ["code_agent", "search_pull_requests"],
            "~3 actions, ~10 seconds",
        )
    if route == "browser":
        return (
            [
                "[orchestrator] -> classify browser automation request",
                "[browser_agent] -> run browser task workflow",
                "[browser_agent] -> return execution result",
            ],
            ["browser_agent", "run_browser_task"],
            "~3 actions, ~15 seconds",
        )
    if route == "memory":
        return (
            [
                "[orchestrator] -> classify memory request",
                "[memory_agent] -> retrieve long-term memory matches",
                "[memory_agent] -> return memory-backed response",
            ],
            ["memory_agent", "memory_store.search_memory"],
            "~3 actions, ~8 seconds",
        )
    return (
        [
            "[orchestrator] -> classify request",
            "[chat_agent] -> prepare response",
            "[chat_agent] -> return final answer",
        ],
        ["chat_agent"],
        "~3 actions, ~6 seconds",
    )


def _risk_level(route: AgentRoute, request: str) -> str:
    normalized = _normalize_message(request)
    if any(keyword in normalized for keyword in IRREVERSIBLE_KEYWORDS):
        return "High"

    if route == "comms" and _is_whatsapp_send_intent(request):
        return "Medium"

    if route == "comms" and _is_google_form_create_intent(request):
        return "Low"

    if route == "docs" and _is_local_folder_create_intent(request):
        return "Medium"

    if route == "docs" and _is_local_open_intent(request):
        return "Low"

    if route == "docs" and _is_local_app_open_intent(request):
        return "Low"

    if route == "browser":
        return "Medium"
    if route in {"calendar", "comms"}:
        return "Low"
    return "None"


def _format_plan(goal: str, steps: list[str], tools: list[str], estimated: str, risk: str) -> str:
    lines = [
        "\u256d\u2500 PLAN \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u256e",
        "\u2502                                              \u2502",
        f"\u2502  Goal: {goal}",
        "\u2502                                              \u2502",
        "\u2502  Steps:",
    ]

    for index, step in enumerate(steps, start=1):
        lines.append(f"\u2502  {index}. {step}")

    lines.extend(
        [
            "\u2502                                              \u2502",
            f"\u2502  Tools needed: {', '.join(tools)}",
            f"\u2502  Estimated: {estimated}",
            f"\u2502  Risk: {risk}",
        ]
    )

    if risk == "High":
        lines.append(
            "\u2502  \u26a0\ufe0f  WARNING: Step 3 is irreversible (requested action may be permanently applied)"
        )

    lines.extend(
        [
            "\u2502                                              \u2502",
            "\u2570\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u256f",
            "",
            "  \u2705 Type \"go\" or \"yes\" to execute this plan",
            "  \u270f\ufe0f  Type \"change: [your edit]\" to modify it",
            "  \u274c Type \"cancel\" to abort",
        ]
    )

    return "\n".join(lines)


def _build_pending_plan(request: str, route: AgentRoute) -> PendingPlan:
    if route == "docs" and _is_local_folder_create_intent(request):
        steps = [
            "[orchestrator] -> confirm local folder creation request",
            "[docs_agent/local_files] -> resolve target disk and folder name",
            "[docs_agent/local_files] -> create folder and return final path",
        ]
        tools = ["docs_agent", "create_local_folder_from_prompt"]
        estimated = "~3 actions, ~6 seconds"
    elif route == "comms" and _is_whatsapp_send_intent(request):
        steps = [
            "[orchestrator] -> validate WhatsApp contact and message payload",
            "[comms_agent/whatsapp] -> launch installed WhatsApp desktop app (fallback: WhatsApp Web) and search target contact",
            "[comms_agent/whatsapp] -> send message and return execution proof",
        ]
        tools = ["comms_agent", "send_whatsapp_message"]
        estimated = "~3 actions, ~20 seconds"
    elif route == "comms" and _is_google_form_create_intent(request):
        steps = [
            "[orchestrator] -> validate Google Form fields from prompt",
            "[comms_agent/gforms] -> create form shell via Google Forms API",
            "[comms_agent/gforms] -> add requested fields and return URLs",
        ]
        tools = ["comms_agent", "create_sample_google_form"]
        estimated = "~3 actions, ~12 seconds"
    elif route == "comms" and _is_email_send_intent(request):
        steps = [
            "[orchestrator] -> validate sender/recipient and intent",
            "[comms_agent/gmail] -> compose requested email payload",
            "[comms_agent/gmail] -> send via connected Gmail account and return confirmation",
        ]
        tools = ["comms_agent", "send_gmail_message"]
        estimated = "~3 actions, ~8 seconds"
    elif route == "docs" and _is_local_app_open_intent(request):
        steps = [
            "[orchestrator] -> confirm local app launch request",
            "[docs_agent/local_files] -> resolve requested desktop application",
            "[docs_agent/local_files] -> launch app and report status",
        ]
        tools = ["docs_agent", "open_local_application_from_prompt"]
        estimated = "~3 actions, ~5 seconds"
    elif route == "docs" and _is_local_open_intent(request):
        steps = [
            "[orchestrator] -> confirm local file open request",
            "[docs_agent/local_files] -> find best matching local media file",
            "[docs_agent/local_files] -> open matched file on device",
        ]
        tools = ["docs_agent", "find_best_local_file", "open_local_file"]
        estimated = "~3 actions, ~8 seconds"
    else:
        steps, tools, estimated = _plan_blueprint(route)
    risk = _risk_level(route, request)
    goal = request.strip() or "Handle user request"
    plan_text = _format_plan(goal=goal, steps=steps, tools=tools, estimated=estimated, risk=risk)
    return PendingPlan(
        request=request,
        route=route,
        plan_text=plan_text,
        steps=steps,
        tools=tools,
        estimated=estimated,
        risk=risk,
    )


async def _execute_route(
    route: AgentRoute,
    message: str,
    *,
    user_id: str | None = None,
    preferred_model: str | None = None,
) -> AgentOutput:
    if route == "docs":
        return await docs_agent.run(message, preferred_model=preferred_model)
    if route == "comms":
        return await comms_agent.run(message, user_id=user_id)
    if route == "calendar":
        return await calendar_agent.run(message)
    if route == "code":
        return await code_agent.run(message)
    if route == "browser":
        return await browser_agent.run(message)
    if route == "memory":
        return await memory_agent.run(message)
    return await chat_agent.run(message, preferred_model=preferred_model)


def _build_execution_summary(plan: PendingPlan, output: AgentOutput) -> str:
    lines = [
        "Execution summary:",
        f"- Goal: {plan.request.strip() or 'N/A'}",
        f"- Route executed: {plan.route}",
        f"- Steps completed: {len(plan.steps)}",
    ]

    tool_results = output.get("tool_results", {})
    if tool_results:
        lines.append(f"- Tool groups: {', '.join(sorted(tool_results.keys()))}")
        for key, value in tool_results.items():
            if isinstance(value, list):
                lines.append(f"- {key}: {len(value)} item(s)")
            elif isinstance(value, dict):
                ok_flag = value.get("ok")
                if ok_flag is True:
                    if key == "google_form":
                        field_count = len(value.get("fields") or [])
                        lines.append(f"- {key}: created successfully with {field_count} required field(s)")
                    elif key == "whatsapp":
                        action_count = len(value.get("actions") or [])
                        lines.append(f"- {key}: sent successfully with {action_count} execution step(s)")
                    elif key == "gmail_send":
                        lines.append("- gmail_send: sent successfully")
                    else:
                        lines.append(f"- {key}: success")
                elif ok_flag is False:
                    error_text = str(value.get("error") or "failed")
                    lines.append(f"- {key}: failed ({error_text[:120]})")
                else:
                    lines.append(f"- {key}: updated")
            elif value is None:
                lines.append(f"- {key}: none")
            else:
                lines.append(f"- {key}: updated")
    else:
        lines.append("- Tool groups: none")

    return "\n".join(lines)


async def _execute_pending_plan(
    plan: PendingPlan,
    *,
    user_id: str | None = None,
    preferred_model: str | None = None,
) -> tuple[bool, str, AgentOutput | None]:
    progress_lines = [
        "Executing plan...",
        "\u2192 Step 1: [orchestrator] -> validate approved plan and prepare execution ... \u2713 done",
    ]

    try:
        output = await _execute_route(
            plan.route,
            plan.request,
            user_id=user_id,
            preferred_model=preferred_model,
        )
    except Exception as exc:
        progress_lines.append(
            "\u2192 Step 2: [agent] -> execute approved action ... \u2717 failed"
        )
        failure_message = (
            "\n".join(progress_lines)
            + f"\n\nPaused due to error: {exc}\nPlease type \"change: ...\" to revise or \"cancel\"."
        )
        return False, failure_message, None

    progress_lines.append(
        "\u2192 Step 2: [agent] -> execute approved action ... \u2713 done"
    )
    progress_lines.append(
        "\u2192 Step 3: [orchestrator] -> assemble final response ... \u2713 done"
    )

    execution_summary = _build_execution_summary(plan, output)
    result_message = (
        "\n".join(progress_lines)
        + f"\n\nResult:\n{output['answer']}\n\n{execution_summary}\n\nAnything needs adjustment?"
    )
    return True, result_message, output


def _is_filename_followup_message(message: str) -> bool:
    normalized = _normalize_message(message)
    has_media_reference = bool(
        re.search(r"\b(mp4|mkv|avi|mov|webm|wmv|flv|m4v)\b", normalized)
    )
    followup_words = ["file name", "filename", "this is", "named"]
    return has_media_reference and any(word in normalized for word in followup_words)


def _rewrite_followup_for_local_open(message: str) -> str:
    return f"open {message.strip()} from my pc"


def _is_local_open_intent(message: str) -> bool:
    normalized = _normalize_message(message)
    action_words = ["open", "oepn", "opne", "play", "launch", "start"]
    local_words = ["pc", "laptop", "local", "computer", "movie", "video", "from my", "drive", "disk", "vlc"]
    has_action_and_local = any(word in normalized for word in action_words) and any(
        word in normalized for word in local_words
    )

    has_filename_hint = _is_filename_followup_message(message)
    return has_action_and_local or has_filename_hint


def _is_local_app_open_intent(message: str) -> bool:
    normalized = _normalize_message(message)
    action_words = ["open", "launch", "start"]
    app_words = [
        "app",
        "software",
        "whatsapp",
        "chrome",
        "notepad",
        "calculator",
        "calc",
        "vlc",
        "discord",
        "spotify",
        "telegram",
    ]
    return any(word in normalized for word in action_words) and any(word in normalized for word in app_words)


def _is_local_folder_create_intent(message: str) -> bool:
    normalized = _normalize_message(message)
    create_words = ["create", "make", "bna", "banado", "bnado", "new"]
    folder_words = ["folder", "directory"]
    local_words = ["drive", "disk", "pc", "laptop", "local"]
    return any(word in normalized for word in create_words) and any(
        word in normalized for word in folder_words
    ) and any(word in normalized for word in local_words)


def _is_email_send_intent(message: str) -> bool:
    normalized = _normalize_message(message)
    send_words = ["send", "bhejo", "email bhejo", "mail karo"]
    mail_words = ["mail", "email", "gmail"]
    return any(word in normalized for word in send_words) and any(word in normalized for word in mail_words)


def _is_whatsapp_send_intent(message: str) -> bool:
    normalized = _normalize_message(message)
    has_whatsapp = "whatsapp" in normalized or "whats app" in normalized
    has_message_action = any(
        token in normalized for token in ["message", "msg", "text", "likho", "bhejo", "send"]
    )
    return has_whatsapp and has_message_action


def _is_google_form_create_intent(message: str) -> bool:
    normalized = _normalize_message(message)
    has_form = any(token in normalized for token in ["google form", "google forms", "form", "forms"])
    has_create = any(token in normalized for token in ["create", "make", "build", "generate", "bna", "banado"])
    return has_form and has_create


def route_intent(message: str) -> AgentRoute:
    text = message.lower()

    if _is_whatsapp_send_intent(text) or _is_google_form_create_intent(text) or _is_email_send_intent(text):
        return "comms"

    if any(word in text for word in ["gmail", "slack", "discord", "outlook", "email", "message"]):
        return "comms"
    if any(word in text for word in ["calendar", "meeting", "meet", "schedule", "invite"]):
        return "calendar"
    if any(word in text for word in ["github", "gitlab", "pr", "pull request", "code"]):
        return "code"
    if any(word in text for word in ["browser", "form", "scrape", "web", "site", "playwright"]):
        return "browser"
    if any(word in text for word in ["remember", "memory", "preference", "context"]):
        return "memory"
    if _is_local_folder_create_intent(text):
        return "docs"
    if _is_local_app_open_intent(text):
        return "docs"
    if _is_local_open_intent(text):
        return "docs"
    if any(
        word in text
        for word in [
            "doc",
            "docs",
            "document",
            "file",
            "files",
            "drive",
            "pdf",
            "form",
            "forms",
            "notion",
            "summary",
            "summarize",
            "brief",
            "notes",
            "folder",
            "upload",
        ]
    ):
        return "docs"
    return "chat"


async def orchestrator_node(state: GraphState) -> dict:
    route = route_intent(state["message"])
    return {
        "route": route,
    }


async def chat_node(state: GraphState) -> dict:
    output: AgentOutput = await chat_agent.run(
        state["message"],
        preferred_model=state.get("preferred_model"),
    )
    return output


async def docs_node(state: GraphState) -> dict:
    output: AgentOutput = await docs_agent.run(
        state["message"],
        preferred_model=state.get("preferred_model"),
    )
    return output


async def comms_node(state: GraphState) -> dict:
    output: AgentOutput = await comms_agent.run(
        state["message"],
        user_id=state.get("user_id"),
    )
    return output


async def calendar_node(state: GraphState) -> dict:
    output: AgentOutput = await calendar_agent.run(state["message"])
    return output


async def code_node(state: GraphState) -> dict:
    output: AgentOutput = await code_agent.run(state["message"])
    return output


async def browser_node(state: GraphState) -> dict:
    output: AgentOutput = await browser_agent.run(state["message"])
    return output


async def memory_node(state: GraphState) -> dict:
    output: AgentOutput = await memory_agent.run(state["message"])
    return output


def pick_route(state: GraphState) -> str:
    return cast(str, state["route"])


def build_graph():
    graph = StateGraph(GraphState)

    graph.add_node("orchestrator", orchestrator_node)
    graph.add_node("chat", chat_node)
    graph.add_node("docs", docs_node)
    graph.add_node("comms", comms_node)
    graph.add_node("calendar", calendar_node)
    graph.add_node("code", code_node)
    graph.add_node("browser", browser_node)
    graph.add_node("memory", memory_node)

    graph.add_edge(START, "orchestrator")
    graph.add_conditional_edges(
        "orchestrator",
        pick_route,
        {
            "chat": "chat",
            "docs": "docs",
            "comms": "comms",
            "calendar": "calendar",
            "code": "code",
            "browser": "browser",
            "memory": "memory",
        },
    )

    graph.add_edge("chat", END)
    graph.add_edge("docs", END)
    graph.add_edge("comms", END)
    graph.add_edge("calendar", END)
    graph.add_edge("code", END)
    graph.add_edge("browser", END)
    graph.add_edge("memory", END)

    return graph.compile()


graph = build_graph()


async def run_orchestration(
    chat_id: str,
    message: str,
    *,
    user_id: str | None = None,
    preferred_model: str | None = None,
) -> GraphState:
    pending_plan = PENDING_PLANS.get(chat_id)

    if not pending_plan:
        direct_change = _extract_change_request(message)
        if direct_change:
            return {
                "chat_id": chat_id,
                "message": message,
                "route": "chat",
                "answer": "No pending plan found. Share a new actionable request first, and I will create a plan.",
                "events": [
                    {
                        "agent": "OrchestratorAgent",
                        "message": "Change request ignored because no plan exists",
                        "status": "completed",
                    }
                ],
                "tool_results": {},
            }

    if pending_plan:
        if _is_cancel(message):
            del PENDING_PLANS[chat_id]
            return {
                "chat_id": chat_id,
                "message": message,
                "route": "chat",
                "answer": "Plan canceled. No actions were executed.",
                "events": [
                    {
                        "agent": "OrchestratorAgent",
                        "message": "Canceled pending plan",
                        "status": "completed",
                    }
                ],
                "tool_results": {},
            }

        change_request = _extract_change_request(message)
        if change_request:
            revised_request = f"{pending_plan.request}\nRevision request: {change_request}"
            revised_route = route_intent(revised_request)
            if not _is_action_route(revised_route):
                revised_route = pending_plan.route

            updated_plan = _build_pending_plan(revised_request, revised_route)
            PENDING_PLANS[chat_id] = updated_plan

            return {
                "chat_id": chat_id,
                "message": message,
                "route": revised_route,
                "answer": "Acknowledged. I updated the plan based on your change request.\n\n"
                + updated_plan.plan_text,
                "events": [
                    {
                        "agent": "OrchestratorAgent",
                        "message": "Plan revised and awaiting approval",
                        "status": "completed",
                    }
                ],
                "tool_results": {},
            }

        if _is_approval(message):
            succeeded, execution_message, output = await _execute_pending_plan(
                pending_plan,
                user_id=user_id,
                preferred_model=preferred_model,
            )
            if succeeded:
                if pending_plan.route == "docs" and _is_local_open_intent(pending_plan.request):
                    LAST_LOCAL_OPEN_REQUESTS[chat_id] = pending_plan.request
                del PENDING_PLANS[chat_id]
                return {
                    "chat_id": chat_id,
                    "message": message,
                    "route": pending_plan.route,
                    "answer": execution_message,
                    "events": output["events"] if output else [],
                    "tool_results": output["tool_results"] if output else {},
                }

            return {
                "chat_id": chat_id,
                "message": message,
                "route": pending_plan.route,
                "answer": execution_message,
                "events": [
                    {
                        "agent": "OrchestratorAgent",
                        "message": "Execution paused after failure",
                        "status": "failed",
                    }
                ],
                "tool_results": {},
            }

        return {
            "chat_id": chat_id,
            "message": message,
            "route": pending_plan.route,
            "answer": "A plan is waiting for approval.\n\n" + pending_plan.plan_text,
            "events": [
                {
                    "agent": "OrchestratorAgent",
                    "message": "Waiting for go/yes/change/cancel",
                    "status": "completed",
                }
            ],
            "tool_results": {},
        }

    detected_route = route_intent(message)
    effective_message = message
    if chat_id in LAST_LOCAL_OPEN_REQUESTS and _is_filename_followup_message(message):
        effective_message = _rewrite_followup_for_local_open(message)
        detected_route = "docs"

    if _wants_direct_answer(message) and _is_action_route(detected_route):
        direct_output = await _execute_route(
            detected_route,
            effective_message,
            user_id=user_id,
            preferred_model=preferred_model,
        )
        return {
            "chat_id": chat_id,
            "message": message,
            "route": detected_route,
            "answer": direct_output["answer"],
            "events": direct_output["events"],
            "tool_results": direct_output["tool_results"],
        }

    if _is_action_route(detected_route):
        pending_plan = _build_pending_plan(effective_message, detected_route)
        PENDING_PLANS[chat_id] = pending_plan
        if detected_route == "docs" and _is_local_open_intent(effective_message):
            LAST_LOCAL_OPEN_REQUESTS[chat_id] = effective_message
        return {
            "chat_id": chat_id,
            "message": message,
            "route": detected_route,
            "answer": pending_plan.plan_text,
            "events": [
                {
                    "agent": "OrchestratorAgent",
                    "message": "Plan prepared and awaiting approval",
                    "status": "completed",
                }
            ],
            "tool_results": {},
        }

    initial_state: GraphState = {
        "chat_id": chat_id,
        "message": message,
        "route": "chat",
        "answer": "",
        "events": [],
        "tool_results": {},
        "user_id": user_id or "anonymous",
        "preferred_model": preferred_model or "",
    }

    result = await graph.ainvoke(initial_state)
    return cast(GraphState, result)

