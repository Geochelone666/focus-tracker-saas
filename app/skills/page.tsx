import { redirect } from "next/navigation";
import { addSkill, deleteSkill, toggleSkill } from "@/app/skills/actions";
import { createClient } from "@/supabase/server";

type SkillRow = {
  id: string;
  name: string;
  is_done: boolean;
};

export default async function SkillsPage({
  searchParams
}: {
  searchParams: { error?: string | string[] };
}) {
  const error = typeof searchParams.error === "string" ? searchParams.error : undefined;
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: skills } = await supabase
    .from("skills")
    .select("id, name, is_done")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  const typedSkills = (skills ?? []) as SkillRow[];

  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-16">
      <h1 className="mb-2 text-3xl font-bold tracking-tight text-slate-900">Skills</h1>
      <p className="mb-6 text-slate-600">Build your checklist and track the skills you have completed.</p>

      {error && (
        <div role="alert" className="mb-6 rounded-md border border-red-200 bg-red-50 p-4 text-red-800">
          {error}
        </div>
      )}

      <section className="mb-8 rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-4 text-lg font-semibold text-slate-900">Add a skill</h2>
        <form action={addSkill} className="flex flex-col gap-3 sm:flex-row">
          <label htmlFor="skill-name" className="sr-only">
            Skill name
          </label>
          <input
            id="skill-name"
            name="name"
            type="text"
            required
            minLength={1}
            maxLength={60}
            placeholder="e.g. TypeScript"
            className="min-w-0 flex-1 rounded-md border border-slate-300 px-3 py-2 text-slate-900 placeholder:text-slate-400 focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200"
          />
          <button
            type="submit"
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700"
          >
            Add Skill
          </button>
        </form>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-4 text-lg font-semibold text-slate-900">Your checklist</h2>

        {typedSkills.length === 0 ? (
          <p className="text-slate-600">No skills yet. Add your first skill above.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {typedSkills.map((skill) => {
              const toggleAction = toggleSkill.bind(null, skill.id, !skill.is_done);
              const deleteAction = deleteSkill.bind(null, skill.id);

              return (
                <li key={skill.id} className="flex items-center gap-3 py-3">
                  <form action={toggleAction}>
                    <button
                      type="submit"
                      aria-label={`${skill.is_done ? "Mark incomplete" : "Mark complete"}: ${skill.name}`}
                      className="flex rounded p-1 transition hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-400"
                    >
                      <input
                        type="checkbox"
                        checked={skill.is_done}
                        readOnly
                        tabIndex={-1}
                        className="pointer-events-none h-5 w-5 rounded border-slate-300 accent-slate-900"
                      />
                    </button>
                  </form>
                  <span
                    className={`min-w-0 flex-1 break-words text-slate-800 ${
                      skill.is_done ? "text-slate-500 line-through" : ""
                    }`}
                  >
                    {skill.name}
                  </span>
                  <form action={deleteAction}>
                    <button
                      type="submit"
                      className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-900 transition hover:bg-slate-100"
                    >
                      Delete
                    </button>
                  </form>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}
