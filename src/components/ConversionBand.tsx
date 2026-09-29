"use client";

/** 转化区：微信号为空串时显示「微信号待配置」且不可复制（沿用镜像语义） */
export default function ConversionBand({
  wechatId,
  onCopy,
}: {
  wechatId: string;
  onCopy: (text: string) => void;
}) {
  const configured = Boolean(wechatId);
  return (
    <section className="conversion" aria-labelledby="conversion-title">
      <h2 id="conversion-title">加入情报群，第一时间拿到新额度</h2>
      <p className="conversion-copy">新上架、限时到期、失效复核，都会先在群里同步。</p>
      {configured ? (
        <button className="btn-primary" type="button" onClick={() => onCopy(wechatId)}>
          复制微信号 {wechatId}
        </button>
      ) : (
        <span className="conversion-placeholder">微信号待配置</span>
      )}
    </section>
  );
}
