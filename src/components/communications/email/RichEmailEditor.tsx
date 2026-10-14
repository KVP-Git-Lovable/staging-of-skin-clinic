import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Bold, Italic, Underline, Link as LinkIcon, Image as ImageIcon,
  List, ListOrdered, Heading1, Heading2, Minus, AlignLeft, AlignCenter, AlignRight,
  Code, Undo, Redo, Variable,
} from "lucide-react";

const MERGE_VARS = [
  { key: "first_name", label: "First name" },
  { key: "last_name", label: "Last name" },
  { key: "email", label: "Email" },
];

interface Props {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minHeight?: number;
}

export function RichEmailEditor({ value, onChange, placeholder, minHeight = 320 }: Props) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [showSource, setShowSource] = useState(false);
  const [source, setSource] = useState(value);

  // Keep the editor in sync when `value` changes from outside (template load, etc.)
  useEffect(() => {
    if (!ref.current) return;
    if (ref.current.innerHTML !== value) ref.current.innerHTML = value || "";
  }, [value]);

  useEffect(() => { setSource(value); }, [value]);

  const exec = useCallback((cmd: string, arg?: string) => {
    ref.current?.focus();
    document.execCommand(cmd, false, arg);
    if (ref.current) onChange(ref.current.innerHTML);
  }, [onChange]);

  const insertHtml = (html: string) => {
    ref.current?.focus();
    document.execCommand("insertHTML", false, html);
    if (ref.current) onChange(ref.current.innerHTML);
  };

  const [linkUrl, setLinkUrl] = useState("");
  const [imgUrl, setImgUrl] = useState("");
  const [btnText, setBtnText] = useState("Learn more");
  const [btnUrl, setBtnUrl] = useState("");

  const applyLink = () => {
    if (!linkUrl) return;
    exec("createLink", linkUrl);
    setLinkUrl("");
  };
  const insertImage = () => {
    if (!imgUrl) return;
    insertHtml(`<img src="${imgUrl}" alt="" style="max-width:100%;height:auto;display:block;margin:12px 0;" />`);
    setImgUrl("");
  };
  const insertButton = () => {
    if (!btnUrl) return;
    insertHtml(`<div style="text-align:center;margin:20px 0;"><a href="${btnUrl}" style="display:inline-block;background:#2563eb;color:#ffffff !important;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:600;font-family:Arial,Helvetica,sans-serif;">${btnText || "Click here"}</a></div>`);
    setBtnUrl("");
  };
  const insertDivider = () => insertHtml(`<hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0;" />`);
  const insertColumns = () => insertHtml(`
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:16px 0;">
  <tr>
    <td valign="top" width="48%" style="padding:8px;">Column one</td>
    <td width="4%"></td>
    <td valign="top" width="48%" style="padding:8px;">Column two</td>
  </tr>
</table>`);

  return (
    <div className="border rounded-md overflow-hidden bg-background">
      <div className="flex flex-wrap items-center gap-1 border-b bg-muted/40 p-1.5">
        <Button type="button" size="sm" variant="ghost" onClick={() => exec("undo")}><Undo className="h-4 w-4" /></Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => exec("redo")}><Redo className="h-4 w-4" /></Button>
        <span className="mx-1 h-5 w-px bg-border" />
        <Button type="button" size="sm" variant="ghost" onClick={() => exec("formatBlock", "H1")}><Heading1 className="h-4 w-4" /></Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => exec("formatBlock", "H2")}><Heading2 className="h-4 w-4" /></Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => exec("bold")}><Bold className="h-4 w-4" /></Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => exec("italic")}><Italic className="h-4 w-4" /></Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => exec("underline")}><Underline className="h-4 w-4" /></Button>
        <span className="mx-1 h-5 w-px bg-border" />
        <Button type="button" size="sm" variant="ghost" onClick={() => exec("insertUnorderedList")}><List className="h-4 w-4" /></Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => exec("insertOrderedList")}><ListOrdered className="h-4 w-4" /></Button>
        <span className="mx-1 h-5 w-px bg-border" />
        <Button type="button" size="sm" variant="ghost" onClick={() => exec("justifyLeft")}><AlignLeft className="h-4 w-4" /></Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => exec("justifyCenter")}><AlignCenter className="h-4 w-4" /></Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => exec("justifyRight")}><AlignRight className="h-4 w-4" /></Button>
        <span className="mx-1 h-5 w-px bg-border" />
        <Popover>
          <PopoverTrigger asChild><Button type="button" size="sm" variant="ghost"><LinkIcon className="h-4 w-4" /></Button></PopoverTrigger>
          <PopoverContent className="w-72 space-y-2">
            <div className="text-xs font-medium">Insert link</div>
            <Input placeholder="https://..." value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} />
            <Button type="button" size="sm" className="w-full" onClick={applyLink}>Apply</Button>
          </PopoverContent>
        </Popover>
        <Popover>
          <PopoverTrigger asChild><Button type="button" size="sm" variant="ghost"><ImageIcon className="h-4 w-4" /></Button></PopoverTrigger>
          <PopoverContent className="w-80 space-y-2">
            <div className="text-xs font-medium">Insert image (URL)</div>
            <Input placeholder="https://..." value={imgUrl} onChange={(e) => setImgUrl(e.target.value)} />
            <Button type="button" size="sm" className="w-full" onClick={insertImage}>Insert</Button>
          </PopoverContent>
        </Popover>
        <Popover>
          <PopoverTrigger asChild><Button type="button" size="sm" variant="outline" className="h-8">Button</Button></PopoverTrigger>
          <PopoverContent className="w-80 space-y-2">
            <div className="text-xs font-medium">Insert button</div>
            <Input placeholder="Button text" value={btnText} onChange={(e) => setBtnText(e.target.value)} />
            <Input placeholder="https://..." value={btnUrl} onChange={(e) => setBtnUrl(e.target.value)} />
            <Button type="button" size="sm" className="w-full" onClick={insertButton}>Insert</Button>
          </PopoverContent>
        </Popover>
        <Button type="button" size="sm" variant="ghost" onClick={insertDivider}><Minus className="h-4 w-4" /></Button>
        <Button type="button" size="sm" variant="outline" className="h-8" onClick={insertColumns}>2 cols</Button>
        <span className="mx-1 h-5 w-px bg-border" />
        <Popover>
          <PopoverTrigger asChild>
            <Button type="button" size="sm" variant="ghost"><Variable className="h-4 w-4" /></Button>
          </PopoverTrigger>
          <PopoverContent className="w-56 p-1">
            <div className="px-2 py-1.5 text-xs text-muted-foreground">Merge variables</div>
            {MERGE_VARS.map((v) => (
              <button
                key={v.key}
                type="button"
                className="w-full text-left px-2 py-1.5 text-sm hover:bg-accent rounded"
                onClick={() => insertHtml(`{{${v.key}}}`)}
              >
                {v.label} <span className="text-muted-foreground text-xs">{`{{${v.key}}}`}</span>
              </button>
            ))}
          </PopoverContent>
        </Popover>
        <div className="ml-auto">
          <Button type="button" size="sm" variant={showSource ? "default" : "ghost"} onClick={() => setShowSource((s) => !s)}>
            <Code className="h-4 w-4 mr-1" /> HTML
          </Button>
        </div>
      </div>

      {showSource ? (
        <textarea
          className="w-full font-mono text-xs p-3 outline-none resize-y bg-background"
          style={{ minHeight }}
          value={source}
          onChange={(e) => setSource(e.target.value)}
          onBlur={() => onChange(source)}
        />
      ) : (
        <div
          ref={ref}
          contentEditable
          suppressContentEditableWarning
          className="p-4 outline-none prose prose-sm max-w-none focus:ring-0"
          style={{ minHeight }}
          onInput={(e) => onChange((e.target as HTMLDivElement).innerHTML)}
          data-placeholder={placeholder || "Compose your email…"}
        />
      )}
    </div>
  );
}

export default RichEmailEditor;
