import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import TextAlign from "@tiptap/extension-text-align";
import Placeholder from "@tiptap/extension-placeholder";
import clsx from "clsx";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Heading,
  Indent,
  Italic,
  List,
  ListOrdered,
  Outdent,
  Quote,
  Redo2,
  Strikethrough,
  Underline as UnderlineIcon,
  Undo2,
  type LucideIcon,
} from "lucide-react";

function ToolButton({
  icon: Icon,
  label,
  onClick,
  active,
  disabled,
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()} // keep editor selection
      onClick={onClick}
      className={clsx(
        "inline-flex h-7 w-7 items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-surface hover:text-ink disabled:opacity-30",
        active && "bg-brand-soft text-ink",
      )}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}

const Divider = () => <span className="mx-1 h-4 w-px bg-line" />;

function Toolbar({ editor }: { editor: Editor }) {
  const chain = () => editor.chain().focus();
  const alignNext = () => {
    const order = ["left", "center", "right"] as const;
    const current = order.find((a) => editor.isActive({ textAlign: a })) ?? "left";
    chain().setTextAlign(order[(order.indexOf(current) + 1) % order.length]).run();
  };
  const AlignIcon = editor.isActive({ textAlign: "center" })
    ? AlignCenter
    : editor.isActive({ textAlign: "right" })
      ? AlignRight
      : AlignLeft;

  return (
    <div className="flex flex-wrap items-center gap-0.5 rounded-lg bg-white px-2 py-1 shadow-sm">
      <ToolButton icon={Undo2} label="Undo" onClick={() => chain().undo().run()} disabled={!editor.can().undo()} />
      <ToolButton icon={Redo2} label="Redo" onClick={() => chain().redo().run()} disabled={!editor.can().redo()} />
      <Divider />
      <ToolButton
        icon={Heading}
        label="Heading"
        active={editor.isActive("heading")}
        onClick={() => chain().toggleHeading({ level: 2 }).run()}
      />
      <Divider />
      <ToolButton icon={Bold} label="Bold" active={editor.isActive("bold")} onClick={() => chain().toggleBold().run()} />
      <ToolButton icon={Italic} label="Italic" active={editor.isActive("italic")} onClick={() => chain().toggleItalic().run()} />
      <ToolButton
        icon={UnderlineIcon}
        label="Underline"
        active={editor.isActive("underline")}
        onClick={() => chain().toggleUnderline().run()}
      />
      <Divider />
      <ToolButton icon={AlignIcon} label="Align" onClick={alignNext} />
      <Divider />
      <ToolButton
        icon={ListOrdered}
        label="Numbered list"
        active={editor.isActive("orderedList")}
        onClick={() => chain().toggleOrderedList().run()}
      />
      <ToolButton
        icon={List}
        label="Bulleted list"
        active={editor.isActive("bulletList")}
        onClick={() => chain().toggleBulletList().run()}
      />
      <ToolButton
        icon={Indent}
        label="Indent"
        onClick={() => chain().sinkListItem("listItem").run()}
        disabled={!editor.can().sinkListItem("listItem")}
      />
      <ToolButton
        icon={Outdent}
        label="Outdent"
        onClick={() => chain().liftListItem("listItem").run()}
        disabled={!editor.can().liftListItem("listItem")}
      />
      <ToolButton
        icon={Quote}
        label="Quote"
        active={editor.isActive("blockquote")}
        onClick={() => chain().toggleBlockquote().run()}
      />
      <Divider />
      <ToolButton
        icon={Strikethrough}
        label="Strikethrough"
        active={editor.isActive("strike")}
        onClick={() => chain().toggleStrike().run()}
      />
    </div>
  );
}

export function RichTextEditor({ onChange }: { onChange: (html: string, isEmpty: boolean) => void }) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Placeholder.configure({ placeholder: "Type Your Reply..." }),
    ],
    onUpdate: ({ editor }) => onChange(editor.getHTML(), editor.isEmpty),
  });

  return (
    <div className="rounded-xl bg-surface p-3">
      {editor && <Toolbar editor={editor} />}
      <EditorContent editor={editor} className="editor-content" />
    </div>
  );
}
