import SectionNav from "./SectionNav";
import ThemeToggle from "./ThemeToggle";

/** 报头刊头（记忆点之一）：mono 日期行 + 宋体大标题 + 报栏导航 */
export default function Masthead({
  dateLineText,
  headlineText,
  shortDate,
}: {
  dateLineText: string;
  headlineText: string;
  shortDate: string;
}) {
  return (
    <header className="masthead">
      <p className="dateline">
        <span className="dateline-full">{dateLineText}</span>
        <span className="dateline-short">{shortDate}</span>
      </p>
      <div className="masthead-row">
        <h1>{headlineText}</h1>
        <ThemeToggle />
      </div>
      <p className="deck">
        人工核验的免费 AI 额度、模型与编程工具情报；所有链接已剥离第三方推广参数。
      </p>
      <SectionNav />
    </header>
  );
}
