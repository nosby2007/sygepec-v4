"use client";
import { useState } from "react";
import AppointmentBoard from "./AppointmentBoard";
import AppointmentCalendar from "./AppointmentCalendar";
import AppointmentDetail from "./AppointmentDetail";

export default function AppointmentWorkspace({ appointments, settings, preparers, zoomEnabled, channels, today }) {
  const [selectedId, setSelectedId] = useState(null);
  const selected = appointments.find((a) => a.id === selectedId);
  const select = (id) => {
    setSelectedId(id);
    requestAnimationFrame(() => document.getElementById("appointment-detail")?.scrollIntoView({ behavior: "smooth", block: "nearest" }));
  };

  return (
    <>
      <div className={selected ? "grid-main mt" : "mt"}>
        <AppointmentCalendar appointments={appointments} timeZone={settings.timeZone} weekly={settings.weekly} today={today} selectedId={selectedId} onSelect={select} />
        {selected && (
          <AppointmentDetail key={selected.id} appointment={selected} timeZone={settings.timeZone} preparers={preparers} zoomEnabled={zoomEnabled} channels={channels} onClose={() => setSelectedId(null)} />
        )}
      </div>
      <AppointmentBoard appointments={appointments} timeZone={settings.timeZone} onManage={select} videoEnabled={Boolean(channels?.video)} />
    </>
  );
}
