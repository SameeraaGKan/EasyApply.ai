import { NewApplicationForm } from "./new-application-form";

export default function NewApplicationPage() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Track a new application</h1>
      <NewApplicationForm />
    </div>
  );
}
