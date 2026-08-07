import { getOwnProfile } from "@/lib/dal/profiles";
import { ProfileForm } from "./profile-form";

export default async function ProfilePage() {
  const profile = await getOwnProfile();
  const links = (profile?.links ?? {}) as {
    linkedin?: string;
    github?: string;
    portfolio?: string;
  };

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Profile</h1>
      <ProfileForm
        defaults={{
          fullName: profile?.fullName ?? "",
          phone: profile?.phone ?? "",
          locationCity: profile?.locationCity ?? "",
          locationState: profile?.locationState ?? "",
          locationCountry: profile?.locationCountry ?? "",
          workAuthorization: profile?.workAuthorization ?? "citizen",
          willingToRelocate: profile?.willingToRelocate ?? false,
          remotePreference: profile?.remotePreference ?? "any",
          linkedin: links.linkedin ?? "",
          github: links.github ?? "",
          portfolio: links.portfolio ?? "",
          defaultAnswerMode: profile?.defaultAnswerMode ?? "agent_drafts",
          eeoGender: profile?.eeoGender ?? "",
          eeoRace: profile?.eeoRace ?? "",
          eeoVeteranStatus: profile?.eeoVeteranStatus ?? "",
          eeoDisabilityStatus: profile?.eeoDisabilityStatus ?? "",
        }}
      />
    </div>
  );
}
