"use client";

import * as React from "react";
import { CheckCircle2, File as FileIcon, Trash2, UploadCloud, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

export interface UploadedFile {
  id: string;
  file: File;
  progress: number;
  status: "uploading" | "completed" | "error";
}

interface FileUploadCardProps extends React.HTMLAttributes<HTMLDivElement> {
  files: UploadedFile[];
  onFilesChange: (files: File[]) => void;
  onFileRemove: (id: string) => void;
  onClose?: () => void;
}

export const FileUploadCard = React.forwardRef<HTMLDivElement, FileUploadCardProps>(
  ({ className, files = [], onFilesChange, onFileRemove, onClose }, ref) => {
    const fileInputRef = React.useRef<HTMLInputElement>(null);
    const [isDragging, setIsDragging] = React.useState(false);

    const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
      const selectedFiles = Array.from(event.target.files || []);
      if (selectedFiles.length > 0) {
        onFilesChange(selectedFiles);
      }
    };

    const triggerFileSelect = () => fileInputRef.current?.click();

    const handleDragEnter = (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
      setIsDragging(true);
    };

    const handleDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
      setIsDragging(false);
    };

    const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
    };

    const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
      setIsDragging(false);
      const droppedFiles = Array.from(event.dataTransfer.files);
      if (droppedFiles.length > 0) {
        onFilesChange(droppedFiles);
      }
    };

    const formatFileSize = (bytes: number) => {
      if (bytes === 0) return "0 KB";
      const k = 1024;
      const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
    };

    return (
      <div ref={ref} className={cn("w-full rounded-md border border-border bg-card", className)}>
        <div className="flex items-start justify-between gap-4 border-b border-border p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-background">
              <UploadCloud className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-sm font-semibold">Upload files</h3>
              <p className="text-xs text-muted-foreground">Select or drop the files you want to attach.</p>
            </div>
          </div>

          {onClose && (
            <Button variant="outline" size="icon" className="h-8 w-8 rounded-md" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>

        <div className="p-4">
          <div
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            onClick={triggerFileSelect}
            className={cn(
              "cursor-pointer rounded-md border border-dashed bg-background px-4 py-8 text-center",
              isDragging ? "border-foreground" : "border-border"
            )}
          >
            <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleFileSelect} />
            <UploadCloud className="mx-auto h-8 w-8 text-muted-foreground" />
            <p className="mt-3 text-sm font-medium">Choose files to upload</p>
            <p className="mt-1 text-xs text-muted-foreground">JPEG, PNG, PDF, and MP4 formats, up to 50 MB.</p>
          </div>
        </div>

        {files.length > 0 && (
          <div className="border-t border-border p-4">
            <ul className="space-y-3">
              {files.map((file) => (
                <li key={file.id} className="rounded-md border border-border bg-background p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-md border border-border bg-card text-xs font-semibold">
                        <FileIcon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{file.file.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {file.status === "uploading" ? `${formatFileSize((file.file.size * file.progress) / 100)} of ${formatFileSize(file.file.size)}` : formatFileSize(file.file.size)}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {file.status === "completed" && <CheckCircle2 className="h-5 w-5 text-emerald-600" />}
                      <Button variant="outline" size="icon" className="h-8 w-8 rounded-md" onClick={() => onFileRemove(file.id)}>
                        {file.status === "completed" ? <Trash2 className="h-4 w-4" /> : <X className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>

                  {file.status === "uploading" && <Progress value={file.progress} className="mt-3 h-1.5" />}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  }
);

FileUploadCard.displayName = "FileUploadCard";