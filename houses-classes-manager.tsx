"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type HouseRow = {
  id: string;
  name: string;
  classes?: { id: string }[];
};

type TeacherRow = {
  id: string;
  nickname: string;
  email: string;
};

type ClassRow = {
  id: string;
  houseId: string;
  level: number;
  teacherId: string;
  dayPattern: string;
  time: string;
  timezone: string;
  lessonMinutes: number;
  qnaMinutes: number;
  isActive: boolean;
  house?: { id: string; name: string };
  teacher?: { id: string; nickname: string; email: string };
};

type ClassesPayload = {
  classes?: ClassRow[];
  houses?: HouseRow[];
  teachers?: TeacherRow[];
  error?: string;
};

type HousesPayload = {
  houses?: HouseRow[];
  error?: string;
};

export function HousesClassesManager() {
  const [message, setMessage] = useState<string | null>(null);
  const [houses, setHouses] = useState<HouseRow[]>([]);
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [teachers, setTeachers] = useState<TeacherRow[]>([]);
  const [houseName, setHouseName] = useState("");
  const [selectedHouseId, setSelectedHouseId] = useState("");
  const [selectedTeacherId, setSelectedTeacherId] = useState("");
  const [level, setLevel] = useState(1);
  const [dayPattern, setDayPattern] = useState("Monday");
  const [time, setTime] = useState("17:00");
  const [lessonMinutes, setLessonMinutes] = useState(45);
  const [qnaMinutes, setQnaMinutes] = useState(15);

  const grouped = useMemo(() => {
    const map = new Map<string, ClassRow[]>();
    for (const cls of classes) {
      const key = cls.house?.name ?? cls.houseId;
      if (!map.has(key)) map.set(key, []);
      map.get(key)?.push(cls);
    }
    return Array.from(map.entries());
  }, [classes]);

  useEffect(() => {
    void loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadAll() {
    setMessage(null);
    const [housesRes, classesRes] = await Promise.all([
      fetch("/api/admin/houses"),
      fetch("/api/admin/classes"),
    ]);

    const housesData = (await housesRes.json()) as HousesPayload;
    const classesData = (await classesRes.json()) as ClassesPayload;
    if (!housesRes.ok) {
      setMessage(housesData.error ?? "Failed to load houses");
      return;
    }
    if (!classesRes.ok) {
      setMessage(classesData.error ?? "Failed to load classes");
      return;
    }

    const nextHouses = housesData.houses ?? [];
    setHouses(nextHouses);
    setClasses(classesData.classes ?? []);
    setTeachers(classesData.teachers ?? []);

    if (!selectedHouseId && nextHouses.length) {
      setSelectedHouseId(nextHouses[0].id);
    }
    if (!selectedTeacherId && (classesData.teachers ?? []).length) {
      setSelectedTeacherId((classesData.teachers ?? [])[0].id);
    }
  }

  async function createHouse(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    const res = await fetch("/api/admin/houses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: houseName }),
    });
    const data = (await res.json()) as { error?: string };
    if (!res.ok) {
      setMessage(data.error ?? "Failed to create house");
      return;
    }
    setHouseName("");
    setMessage("House created");
    await loadAll();
  }

  async function renameHouse(id: string, currentName: string) {
    const name = window.prompt("New house name", currentName)?.trim();
    if (!name || name === currentName) return;
    const res = await fetch(`/api/admin/houses/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const data = (await res.json()) as { error?: string };
    if (!res.ok) {
      setMessage(data.error ?? "Failed to rename house");
      return;
    }
    setMessage("House updated");
    await loadAll();
  }

  async function deleteHouse(id: string) {
    if (!window.confirm("Delete this house?")) return;
    const res = await fetch(`/api/admin/houses/${id}`, { method: "DELETE" });
    const data = (await res.json()) as { error?: string };
    if (!res.ok) {
      setMessage(data.error ?? "Failed to delete house");
      return;
    }
    setMessage("House deleted");
    await loadAll();
  }

  async function createClass(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    const res = await fetch("/api/admin/classes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        houseId: selectedHouseId,
        teacherId: selectedTeacherId,
        level,
        dayPattern,
        time,
        lessonMinutes,
        qnaMinutes,
        timezone: "UTC",
      }),
    });
    const data = (await res.json()) as { error?: string };
    if (!res.ok) {
      setMessage(data.error ?? "Failed to create class");
      return;
    }
    setMessage("Class created");
    await loadAll();
  }

  async function editClass(cls: ClassRow) {
    const nextLevel = Number(window.prompt("Level", String(cls.level)));
    const nextDay = window.prompt("Day", cls.dayPattern);
    const nextTime = window.prompt("Time", cls.time);
    const nextLessonMinutes = Number(
      window.prompt("Lesson minutes", String(cls.lessonMinutes)),
    );
    if (!nextDay || !nextTime || !Number.isFinite(nextLevel) || !Number.isFinite(nextLessonMinutes)) {
      return;
    }

    const res = await fetch(`/api/admin/classes/${cls.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        level: nextLevel,
        dayPattern: nextDay,
        time: nextTime,
        lessonMinutes: nextLessonMinutes,
      }),
    });
    const data = (await res.json()) as { error?: string };
    if (!res.ok) {
      setMessage(data.error ?? "Failed to update class");
      return;
    }
    setMessage("Class updated");
    await loadAll();
  }

  async function toggleClass(cls: ClassRow) {
    const res = await fetch(`/api/admin/classes/${cls.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !cls.isActive }),
    });
    const data = (await res.json()) as { error?: string };
    if (!res.ok) {
      setMessage(data.error ?? "Failed to update class");
      return;
    }
    setMessage(!cls.isActive ? "Class activated" : "Class deactivated");
    await loadAll();
  }

  async function deleteClass(id: string) {
    if (!window.confirm("Delete this class?")) return;
    const res = await fetch(`/api/admin/classes/${id}`, { method: "DELETE" });
    const data = (await res.json()) as { error?: string };
    if (!res.ok) {
      setMessage(data.error ?? "Failed to delete class");
      return;
    }
    setMessage("Class deleted");
    await loadAll();
  }

  return (
    <section className="rounded-xl border border-[var(--line)] bg-white p-5">
      <h2 className="text-xl font-semibold">Houses and classes</h2>
      <p className="mt-1 text-sm text-[var(--text-soft)]">
        Manage academy houses and class schedules (teacher + day/time).
      </p>

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={loadAll}
          className="rounded bg-[var(--cta-blue)] px-3 py-2 text-sm font-semibold text-white"
        >
          Refresh houses/classes
        </button>
      </div>

      {message && <p className="mt-2 text-sm text-[var(--text-soft)]">{message}</p>}

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <form onSubmit={createHouse} className="space-y-2 rounded border border-[var(--line)] p-3">
          <p className="text-sm font-semibold">Create house</p>
          <input
            value={houseName}
            onChange={(e) => setHouseName(e.target.value)}
            placeholder="House of Picassos"
            className="w-full rounded border border-[var(--line)] p-2 text-sm"
            required
          />
          <button className="rounded bg-[var(--cta-green)] px-3 py-2 text-sm font-semibold text-white">
            Add house
          </button>
        </form>

        <form onSubmit={createClass} className="space-y-2 rounded border border-[var(--line)] p-3">
          <p className="text-sm font-semibold">Create class</p>
          <select
            className="w-full rounded border border-[var(--line)] p-2 text-sm"
            value={selectedHouseId}
            onChange={(e) => setSelectedHouseId(e.target.value)}
            required
          >
            {!houses.length && <option value="">No houses yet</option>}
            {houses.map((h) => (
              <option key={h.id} value={h.id}>
                {h.name}
              </option>
            ))}
          </select>
          <select
            className="w-full rounded border border-[var(--line)] p-2 text-sm"
            value={selectedTeacherId}
            onChange={(e) => setSelectedTeacherId(e.target.value)}
            required
          >
            {!teachers.length && <option value="">No teachers yet</option>}
            {teachers.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nickname} ({t.email})
              </option>
            ))}
          </select>
          <div className="grid grid-cols-2 gap-2">
            <input
              type="number"
              min={1}
              value={level}
              onChange={(e) => setLevel(Number(e.target.value))}
              className="rounded border border-[var(--line)] p-2 text-sm"
              placeholder="Level"
            />
            <input
              value={dayPattern}
              onChange={(e) => setDayPattern(e.target.value)}
              className="rounded border border-[var(--line)] p-2 text-sm"
              placeholder="Day"
            />
            <input
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className="rounded border border-[var(--line)] p-2 text-sm"
              placeholder="17:00"
            />
            <input
              type="number"
              min={30}
              max={120}
              value={lessonMinutes}
              onChange={(e) => setLessonMinutes(Number(e.target.value))}
              className="rounded border border-[var(--line)] p-2 text-sm"
              placeholder="Lesson minutes"
            />
          </div>
          <input
            type="number"
            min={0}
            max={60}
            value={qnaMinutes}
            onChange={(e) => setQnaMinutes(Number(e.target.value))}
            className="w-full rounded border border-[var(--line)] p-2 text-sm"
            placeholder="Q&A minutes"
          />
          <button className="rounded bg-[var(--cta-green)] px-3 py-2 text-sm font-semibold text-white">
            Add class
          </button>
        </form>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="space-y-2 rounded border border-[var(--line)] p-3">
          <p className="text-sm font-semibold">Houses</p>
          {!houses.length && <p className="text-sm text-[var(--text-soft)]">No houses loaded.</p>}
          {houses.map((house) => (
            <div key={house.id} className="flex items-center justify-between rounded border border-[var(--line)] p-2 text-sm">
              <div>
                <p className="font-semibold">{house.name}</p>
                <p className="text-[var(--text-soft)]">{house.classes?.length ?? 0} classes</p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => renameHouse(house.id, house.name)}
                  className="rounded bg-zinc-700 px-2 py-1 text-xs font-semibold text-white"
                >
                  Rename
                </button>
                <button
                  type="button"
                  onClick={() => deleteHouse(house.id)}
                  className="rounded bg-red-600 px-2 py-1 text-xs font-semibold text-white"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="space-y-2 rounded border border-[var(--line)] p-3">
          <p className="text-sm font-semibold">Classes</p>
          {!classes.length && <p className="text-sm text-[var(--text-soft)]">No classes loaded.</p>}
          {grouped.map(([houseName, classRows]) => (
            <div key={houseName} className="space-y-1">
              <p className="text-xs font-semibold text-[var(--text-soft)]">{houseName}</p>
              {classRows.map((cls) => (
                <div key={cls.id} className="rounded border border-[var(--line)] p-2 text-sm">
                  <p className="font-semibold">
                    Level {cls.level} • {cls.teacher?.nickname ?? cls.teacherId}
                  </p>
                  <p className="text-[var(--text-soft)]">
                    {cls.dayPattern} {cls.time} • {cls.lessonMinutes} min •{" "}
                    {cls.isActive ? "active" : "inactive"}
                  </p>
                  <div className="mt-1 flex gap-2">
                    <button
                      type="button"
                      onClick={() => editClass(cls)}
                      className="rounded bg-zinc-700 px-2 py-1 text-xs font-semibold text-white"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleClass(cls)}
                      className="rounded bg-indigo-700 px-2 py-1 text-xs font-semibold text-white"
                    >
                      {cls.isActive ? "Deactivate" : "Activate"}
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteClass(cls.id)}
                      className="rounded bg-red-600 px-2 py-1 text-xs font-semibold text-white"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
