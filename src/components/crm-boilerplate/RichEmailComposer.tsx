"use client";

import { useEffect, useRef } from "react";
import { Bold, Italic, Link, List, ListOrdered, Underline } from "lucide-react";

type RichEmailComposerProps = {
  autoFocus?: boolean;
  className?: string;
  disabled?: boolean;
  htmlValue?: string;
  id: string;
  onChange: (text: string, html: string) => void;
  placeholder?: string;
  value: string;
};

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function plainTextHtml(value: string) {
  return value
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

function safeEditorHtml(value: string) {
  const template = document.createElement("template");
  template.innerHTML = value;
  const allowedTags = new Set([
    "A", "B", "BLOCKQUOTE", "BR", "DIV", "EM", "I", "LI", "OL", "P",
    "SPAN", "STRONG", "U", "UL",
  ]);

  for (const element of Array.from(template.content.querySelectorAll("*"))) {
    if (!allowedTags.has(element.tagName)) {
      element.replaceWith(...Array.from(element.childNodes));
      continue;
    }

    for (const attribute of Array.from(element.attributes)) {
      if (element.tagName !== "A" || !["href", "title"].includes(attribute.name)) {
        element.removeAttribute(attribute.name);
      }
    }

    if (element.tagName === "A") {
      const href = element.getAttribute("href") ?? "";
      if (!/^(?:https?:|mailto:)/i.test(href)) element.removeAttribute("href");
      element.setAttribute("rel", "noopener noreferrer");
      element.setAttribute("target", "_blank");
    }
  }

  return template.innerHTML;
}

export default function RichEmailComposer({
  autoFocus = false,
  className = "",
  disabled = false,
  htmlValue = "",
  id,
  onChange,
  placeholder = "Write your reply...",
  value,
}: RichEmailComposerProps) {
  const editorRef = useRef<HTMLDivElement>(null);

  function emitChange() {
    const editor = editorRef.current;
    if (!editor) return;
    onChange(editor.innerText.replace(/\u00a0/g, " "), editor.innerHTML);
  }

  function apply(command: string, commandValue?: string) {
    if (disabled) return;
    editorRef.current?.focus();
    document.execCommand(command, false, commandValue);
    emitChange();
  }

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const nextHtml = htmlValue ? safeEditorHtml(htmlValue) : plainTextHtml(value);
    if (editor.innerHTML === nextHtml) return;
    editor.innerHTML = nextHtml;
  }, [htmlValue, value]);

  useEffect(() => {
    if (autoFocus && !disabled) editorRef.current?.focus();
  }, [autoFocus, disabled]);

  const controls = [
    { command: "bold", icon: Bold, label: "Bold" },
    { command: "italic", icon: Italic, label: "Italic" },
    { command: "underline", icon: Underline, label: "Underline" },
    { command: "insertUnorderedList", icon: List, label: "Bulleted list" },
    { command: "insertOrderedList", icon: ListOrdered, label: "Numbered list" },
  ];

  return (
    <div className={`overflow-hidden rounded-lg border border-gray-300 bg-white focus-within:border-brand-500 focus-within:ring-3 focus-within:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-950 ${className}`}>
      <div className="flex flex-wrap items-center gap-1 border-b border-gray-200 bg-gray-50 px-2 py-1.5 dark:border-gray-800 dark:bg-white/[0.03]">
        {controls.map(({ command, icon: Icon, label }) => (
          <button
            key={command}
            aria-label={label}
            className="inline-grid h-8 w-8 place-items-center rounded-md text-gray-600 hover:bg-white hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-40 dark:text-gray-300 dark:hover:bg-gray-900 dark:hover:text-white"
            disabled={disabled}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => apply(command)}
            title={label}
            type="button"
          >
            <Icon className="h-4 w-4" />
          </button>
        ))}
        <button
          aria-label="Add link"
          className="inline-grid h-8 w-8 place-items-center rounded-md text-gray-600 hover:bg-white hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-40 dark:text-gray-300 dark:hover:bg-gray-900 dark:hover:text-white"
          disabled={disabled}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            const entered = window.prompt("Enter a link URL");
            if (!entered?.trim()) return;
            const url = /^(?:https?:|mailto:)/i.test(entered.trim())
              ? entered.trim()
              : `https://${entered.trim()}`;
            apply("createLink", url);
          }}
          title="Add link"
          type="button"
        >
          <Link className="h-4 w-4" />
        </button>
      </div>
      <div
        aria-label="Email message"
        aria-multiline="true"
        className="min-h-36 px-3 py-3 text-sm leading-6 text-gray-800 outline-none empty:before:pointer-events-none empty:before:text-gray-400 empty:before:content-[attr(data-placeholder)] dark:text-white/90"
        contentEditable={!disabled}
        id={id}
        onInput={emitChange}
        onPaste={(event) => {
          event.preventDefault();
          document.execCommand("insertText", false, event.clipboardData.getData("text/plain"));
          emitChange();
        }}
        ref={editorRef}
        role="textbox"
        data-placeholder={placeholder}
        suppressContentEditableWarning
      />
    </div>
  );
}
