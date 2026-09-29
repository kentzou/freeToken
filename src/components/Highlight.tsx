/** 记忆点之二：荧光笔标注（暗色自动降透明度） */
export default function Highlight({ color = "y", children }: { color?: "y" | "g"; children: React.ReactNode }) {
  return <mark className={`hl hl-${color}`}>{children}</mark>;
}
