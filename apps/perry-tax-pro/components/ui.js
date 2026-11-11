import Icon from "@/components/Icon";
import { Sparkline } from "@/components/charts";

export function PageHead({ kicker, icon, title, desc, children }) {
  return (
    <div className="page-head">
      <div>
        {kicker && <div className="kicker">{icon && <Icon name={icon} size={15} />}{kicker}</div>}
        <h1>{title}</h1>
        {desc && <p className="desc small">{desc}</p>}
      </div>
      {children && <div className="row">{children}</div>}
    </div>
  );
}

export function Kpi({ label, value, icon = "chart", tone = "", foot, spark, sparkColor, valueStyle }) {
  return (
    <div className="card kpi card-hover">
      <div className="kpi-head">
        <div className="lbl">{label}</div>
        <span className={`kpi-icon ${tone}`}><Icon name={icon} size={18} /></span>
      </div>
      <div className="val" style={valueStyle}>{value}</div>
      {(foot || spark) && (
        <div className="kpi-foot">
          <span className="small muted">{foot}</span>
          {spark && <Sparkline values={spark} color={sparkColor} width={96} height={30} />}
        </div>
      )}
    </div>
  );
}

export function Empty({ icon = "sparkle", title, children }) {
  return (
    <div className="empty">
      <div className="icon-badge"><Icon name={icon} size={22} /></div>
      {title && <b>{title}</b>}
      {children && <p className="small">{children}</p>}
    </div>
  );
}

export function ChartEmpty({ icon = "chart", children }) {
  return (
    <div className="chart-empty">
      <div><Icon name={icon} size={30} />{children}</div>
    </div>
  );
}

const AVATAR_TONES = ["c1", "c2", "c3", "c4", "c5"];
export function avatarTone(name = "") {
  let h = 0;
  for (const ch of name) h = (h + ch.charCodeAt(0)) % 997;
  return AVATAR_TONES[h % AVATAR_TONES.length];
}

export function Avatar({ name = "?", size = "" }) {
  return <span className={`avatar ${size} ${avatarTone(name)}`}>{name.trim()[0]?.toUpperCase() || "?"}</span>;
}
