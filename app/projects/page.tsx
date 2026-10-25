import { planningContext, planningData } from '@/lib/planning-data';
import { ProjectForm } from '@/components/planning-forms';
import { PlanCard } from '@/components/plan-card';
import { PlanForm } from '@/components/plan-form';
import { toggleProject } from '@/app/planning/actions';
import { SubmitButton } from '@/components/submit-button';

export default async function ProjectsPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const params = await searchParams;
  const context = await planningContext();
  const { schedules, projects, skills } = await planningData(context);
  const {data:totals,error}=await context.supabase.rpc('task_focus_totals',{p_ids:schedules.map(item=>item.id)});
  if(error)throw error;
  const sessions: {schedule_id:string;duration_sec:number}[]=(totals??[]).map((item:{schedule_id:string;seconds:number})=>({schedule_id:item.schedule_id,duration_sec:Number(item.seconds)}));
  const {data:projectTotals,error:projectError}=await context.supabase.rpc('project_focus_totals');
  if(projectError)throw projectError;
  const projectSeconds=new Map<string,number>((projectTotals??[]).map((row:{project_id:string;seconds:number})=>[row.project_id,Number(row.seconds)]));
  return <main className="mx-auto max-w-5xl px-4 py-10">
    <h1 className="text-3xl font-bold">Projects & Goals</h1><p className="mt-2 mb-6 text-slate-600">Connect daily actions to something bigger. Project completion is a separate choice from task completion.</p>
    {typeof params.error === 'string' && <p role="alert" className="mb-4 text-red-800">{params.error}</p>}
    <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
      <section className="space-y-4">
        {projects.length === 0 && <p className="text-slate-500">Create your first goal, then add a few small steps.</p>}
        {projects.map(project => {
          const tasks = schedules.filter(item => item.project_id === project.id && !item.deleted_at);
          const completed = tasks.filter(item => item.is_done).length;
          const minutes=Math.floor((projectSeconds.get(project.id)??0)/60);
          return <article key={project.id} className="rounded-lg border bg-white p-5">
            <h2 className="break-words text-xl font-semibold">{project.name}{project.is_done ? ' · Completed' : ''}</h2>
            {project.description && <p className="mt-2 whitespace-pre-wrap break-words text-sm text-slate-600">{project.description}</p>}
            <p className="my-3 text-sm text-slate-600">{completed}/{tasks.length} steps complete · {minutes}m focused{project.target_date ? ` · Target: ${project.target_date}` : ''}</p>
            <progress aria-label={`${project.name} progress`} value={completed} max={Math.max(1,tasks.length)} className="mb-3 w-full accent-slate-900" />
            <form action={toggleProject.bind(null,project.id,!project.is_done)}><SubmitButton label={project.is_done ? 'Reopen project' : 'Mark project complete'} /></form>
            <details className="mt-4"><summary className="cursor-pointer font-medium">Steps and next actions</summary>
              <ul className="my-4 space-y-3">{tasks.map(plan => <PlanCard series={schedules} key={plan.id} plan={plan} projects={projects} skills={skills} returnTo="/projects" actualMinutes={sessions.some(s=>s.schedule_id===plan.id) ? sessions.find(s=>s.schedule_id===plan.id)!.duration_sec/60 : undefined} />)}</ul>
              <h3 className="mb-3 font-semibold">Add a step</h3><PlanForm returnTo="/projects" projects={projects} skills={skills} projectId={project.id} />
            </details>
          </article>;
        })}
      </section>
      <section className="h-fit rounded-lg border bg-white p-5"><h2 className="mb-3 font-semibold">New project or goal</h2><ProjectForm /></section>
    </div>
  </main>;
}
