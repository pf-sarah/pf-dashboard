import { SignUp } from '@clerk/nextjs';

export default function SignUpPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50">
      <div className="flex flex-col items-center gap-6">
        <div className="text-center">
          <h1 className="text-2xl font-semibold text-slate-800">Pressed Floral</h1>
          <p className="text-sm text-slate-500 mt-1">Create your account</p>
        </div>
        <SignUp />
      </div>
    </div>
  );
}
