'use client';
import { useId } from 'react';

export function FocusOptions() {
  const presets = useId();
  return <fieldset className="flex min-w-0 flex-wrap gap-3">
    <legend className="sr-only">Focus timing</legend>
    <label className="text-sm">Mode<select name="focus_mode" defaultValue="elapsed" className="ml-2 rounded border bg-white px-2 py-2">
      <option value="elapsed">Count up</option><option value="countdown">Countdown</option>
    </select></label>
    <label className="text-sm">Countdown minutes<input name="focus_minutes" type="number" min={1} max={1440} step={1} defaultValue={25} list={presets} className="ml-2 w-24 rounded border px-2 py-2" /></label>
    <datalist id={presets}><option value="25" /><option value="45" /><option value="60" /></datalist>
  </fieldset>;
}
