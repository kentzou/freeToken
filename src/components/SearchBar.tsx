"use client";

export default function SearchBar({
  value,
  onChange,
  inputRef,
}: {
  value: string;
  onChange: (v: string) => void;
  inputRef?: React.RefObject<HTMLInputElement>;
}) {
  return (
    <div className="search-wrap">
      <label className="visually-hidden" htmlFor="q">
        搜索情报
      </label>
      <input
        id="q"
        ref={inputRef}
        className="search"
        type="search"
        value={value}
        placeholder="搜索模型、平台或额度关键词"
        onChange={(e) => onChange(e.target.value)}
      />
      <kbd className="kbd-hint" aria-hidden="true">
        ⌘K
      </kbd>
    </div>
  );
}
