type LoginButtonProps = {
  label?: string;
};

export function LoginButton({ label = "Login" }: LoginButtonProps) {
  return (
    <button
      type="button"
      className="rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
    >
      {label}
    </button>
  );
}
