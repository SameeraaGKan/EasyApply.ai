"use client";

import { useActionState } from "react";
import { saveProfile, type ProfileActionState } from "./actions";

const initialState: ProfileActionState = { error: null };

type Props = {
  defaults: {
    fullName: string;
    phone: string;
    locationCity: string;
    locationState: string;
    locationCountry: string;
    workAuthorization: string;
    willingToRelocate: boolean;
    remotePreference: string;
    linkedin: string;
    github: string;
    portfolio: string;
    defaultAnswerMode: string;
    eeoGender: string;
    eeoRace: string;
    eeoVeteranStatus: string;
    eeoDisabilityStatus: string;
  };
};

const inputClass =
  "rounded border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900";
const labelClass = "flex flex-col gap-1 text-sm";

export function ProfileForm({ defaults }: Props) {
  const [state, action, pending] = useActionState(saveProfile, initialState);

  return (
    <form action={action} className="flex flex-col gap-8">
      <section className="flex flex-col gap-3">
        <h2 className="font-medium">Contact</h2>
        <label className={labelClass}>
          Full name
          <input name="fullName" defaultValue={defaults.fullName} required className={inputClass} />
        </label>
        <label className={labelClass}>
          Phone
          <input name="phone" defaultValue={defaults.phone} className={inputClass} />
        </label>
        <div className="grid grid-cols-3 gap-3">
          <label className={labelClass}>
            City
            <input name="locationCity" defaultValue={defaults.locationCity} className={inputClass} />
          </label>
          <label className={labelClass}>
            State
            <input name="locationState" defaultValue={defaults.locationState} className={inputClass} />
          </label>
          <label className={labelClass}>
            Country
            <input
              name="locationCountry"
              defaultValue={defaults.locationCountry}
              className={inputClass}
            />
          </label>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-medium">Work preferences</h2>
        <label className={labelClass}>
          Work authorization
          <select
            name="workAuthorization"
            defaultValue={defaults.workAuthorization}
            required
            className={inputClass}
          >
            <option value="citizen">U.S. citizen</option>
            <option value="green_card">Green card holder</option>
            <option value="visa_sponsorship_required">Requires visa sponsorship</option>
            <option value="other">Other</option>
          </select>
        </label>
        <label className={labelClass}>
          Remote preference
          <select
            name="remotePreference"
            defaultValue={defaults.remotePreference}
            required
            className={inputClass}
          >
            <option value="remote">Remote only</option>
            <option value="hybrid">Hybrid</option>
            <option value="onsite">Onsite</option>
            <option value="any">Any</option>
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="willingToRelocate"
            value="true"
            defaultChecked={defaults.willingToRelocate}
          />
          Willing to relocate
        </label>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-medium">Links</h2>
        <label className={labelClass}>
          LinkedIn
          <input name="linkedin" type="url" defaultValue={defaults.linkedin} className={inputClass} />
        </label>
        <label className={labelClass}>
          GitHub
          <input name="github" type="url" defaultValue={defaults.github} className={inputClass} />
        </label>
        <label className={labelClass}>
          Portfolio
          <input
            name="portfolio"
            type="url"
            defaultValue={defaults.portfolio}
            className={inputClass}
          />
        </label>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-medium">Application questions</h2>
        <p className="text-sm text-neutral-500">
          When an application has custom questions, should the agent draft answers for you, or
          would you rather answer them yourself? Agent-drafted answers are grounded in your
          resume and profile and are recommended — you can always override any individual
          answer later.
        </p>
        <label className={labelClass}>
          Default
          <select
            name="defaultAnswerMode"
            defaultValue={defaults.defaultAnswerMode}
            required
            className={inputClass}
          >
            <option value="agent_drafts">Let the agent draft answers (recommended)</option>
            <option value="ask_me">Ask me for each question</option>
          </select>
        </label>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-medium">Voluntary EEO disclosures</h2>
        <p className="text-sm text-neutral-500">
          Optional. Some applications ask for this information for compliance reporting.
          Providing it here lets the agent fill it in consistently — leave any field blank to
          skip it.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <label className={labelClass}>
            Gender
            <input name="eeoGender" defaultValue={defaults.eeoGender} className={inputClass} />
          </label>
          <label className={labelClass}>
            Race/ethnicity
            <input name="eeoRace" defaultValue={defaults.eeoRace} className={inputClass} />
          </label>
          <label className={labelClass}>
            Veteran status
            <input
              name="eeoVeteranStatus"
              defaultValue={defaults.eeoVeteranStatus}
              className={inputClass}
            />
          </label>
          <label className={labelClass}>
            Disability status
            <input
              name="eeoDisabilityStatus"
              defaultValue={defaults.eeoDisabilityStatus}
              className={inputClass}
            />
          </label>
        </div>
      </section>

      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state.success && <p className="text-sm text-green-600">Saved.</p>}

      <button
        type="submit"
        disabled={pending}
        className="self-start rounded bg-neutral-900 px-4 py-2 text-white disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900"
      >
        {pending ? "Saving…" : "Save profile"}
      </button>
    </form>
  );
}
