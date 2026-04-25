import { SignUp } from '@clerk/nextjs';

export default function SignUpPage() {
  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4 py-12">
      <SignUp />
    </div>
  );
}
