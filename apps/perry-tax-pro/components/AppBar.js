"use client";
import { useRouter } from "next/navigation";
import Icon from "@/components/Icon";

// Top bar for web pages opened inside the native apps: Back to the previous screen (or
// the app's home when there is none) instead of the website's menus.
export default function AppBar({ title, home }) {
  const router = useRouter();
  const back = () => {
    if (window.history.length > 1) router.back();
    else window.location.assign(home);
  };
  return (
    <header className="app-bar">
      <button type="button" className="app-bar-back" onClick={back} aria-label="Back"><Icon name="back" size={22} /></button>
      <b className="truncate">{title}</b>
      <a className="app-bar-home" href={home}>Done</a>
    </header>
  );
}
