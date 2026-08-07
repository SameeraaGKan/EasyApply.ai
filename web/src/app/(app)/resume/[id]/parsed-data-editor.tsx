"use client";

import { useActionState, useState } from "react";
import { updateParsedResumeData, type EditActionState } from "./actions";

const initialState: EditActionState = { error: null };
const inputClass =
  "rounded border border-neutral-300 px-2 py-1 text-sm dark:border-neutral-700 dark:bg-neutral-900";

type Skill = { name: string; category?: string; yearsExperience?: number };
type Experience = {
  company: string;
  title: string;
  startDate?: string;
  endDate?: string;
  description?: string;
};
type Education = { institution: string; degree?: string; field?: string; graduationDate?: string };

type Props = {
  resumeId: string;
  initialSkills: Skill[];
  initialExperience: Experience[];
  initialEducation: Education[];
  initialTotalYearsExperience: number | null;
  initialSeniorityLevel: string | null;
};

export function ParsedDataEditor({
  resumeId,
  initialSkills,
  initialExperience,
  initialEducation,
  initialTotalYearsExperience,
  initialSeniorityLevel,
}: Props) {
  const [state, action, pending] = useActionState(updateParsedResumeData, initialState);
  const [skills, setSkills] = useState<Skill[]>(initialSkills);
  const [experience, setExperience] = useState<Experience[]>(initialExperience);
  const [education, setEducation] = useState<Education[]>(initialEducation);

  return (
    <form action={action} className="flex flex-col gap-8">
      <input type="hidden" name="resumeId" value={resumeId} />
      <input type="hidden" name="skills" value={JSON.stringify(skills)} />
      <input type="hidden" name="workExperience" value={JSON.stringify(experience)} />
      <input type="hidden" name="education" value={JSON.stringify(education)} />

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="font-medium">Skills</h2>
          <button
            type="button"
            onClick={() => setSkills([...skills, { name: "" }])}
            className="text-sm underline"
          >
            Add skill
          </button>
        </div>
        <div className="flex flex-col gap-2">
          {skills.map((skill, i) => (
            <div key={i} className="flex gap-2">
              <input
                className={`${inputClass} flex-1`}
                placeholder="Skill"
                value={skill.name}
                onChange={(e) =>
                  setSkills(skills.map((s, j) => (j === i ? { ...s, name: e.target.value } : s)))
                }
              />
              <input
                className={`${inputClass} w-24`}
                type="number"
                placeholder="Years"
                value={skill.yearsExperience ?? ""}
                onChange={(e) =>
                  setSkills(
                    skills.map((s, j) =>
                      j === i ? { ...s, yearsExperience: Number(e.target.value) || undefined } : s,
                    ),
                  )
                }
              />
              <button
                type="button"
                onClick={() => setSkills(skills.filter((_, j) => j !== i))}
                className="text-sm text-red-600"
              >
                Remove
              </button>
            </div>
          ))}
          {skills.length === 0 && (
            <p className="text-sm text-neutral-500">No skills extracted yet.</p>
          )}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="font-medium">Work experience</h2>
          <button
            type="button"
            onClick={() => setExperience([...experience, { company: "", title: "" }])}
            className="text-sm underline"
          >
            Add role
          </button>
        </div>
        <div className="flex flex-col gap-4">
          {experience.map((exp, i) => (
            <div
              key={i}
              className="flex flex-col gap-2 rounded border border-neutral-200 p-3 dark:border-neutral-800"
            >
              <div className="flex gap-2">
                <input
                  className={`${inputClass} flex-1`}
                  placeholder="Company"
                  value={exp.company}
                  onChange={(e) =>
                    setExperience(
                      experience.map((x, j) => (j === i ? { ...x, company: e.target.value } : x)),
                    )
                  }
                />
                <input
                  className={`${inputClass} flex-1`}
                  placeholder="Title"
                  value={exp.title}
                  onChange={(e) =>
                    setExperience(
                      experience.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)),
                    )
                  }
                />
              </div>
              <div className="flex gap-2">
                <input
                  className={`${inputClass} flex-1`}
                  placeholder="Start date"
                  value={exp.startDate ?? ""}
                  onChange={(e) =>
                    setExperience(
                      experience.map((x, j) => (j === i ? { ...x, startDate: e.target.value } : x)),
                    )
                  }
                />
                <input
                  className={`${inputClass} flex-1`}
                  placeholder="End date"
                  value={exp.endDate ?? ""}
                  onChange={(e) =>
                    setExperience(
                      experience.map((x, j) => (j === i ? { ...x, endDate: e.target.value } : x)),
                    )
                  }
                />
              </div>
              <textarea
                className={inputClass}
                placeholder="Description"
                value={exp.description ?? ""}
                onChange={(e) =>
                  setExperience(
                    experience.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)),
                  )
                }
              />
              <button
                type="button"
                onClick={() => setExperience(experience.filter((_, j) => j !== i))}
                className="self-start text-sm text-red-600"
              >
                Remove
              </button>
            </div>
          ))}
          {experience.length === 0 && (
            <p className="text-sm text-neutral-500">No work experience extracted yet.</p>
          )}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="font-medium">Education</h2>
          <button
            type="button"
            onClick={() => setEducation([...education, { institution: "" }])}
            className="text-sm underline"
          >
            Add
          </button>
        </div>
        <div className="flex flex-col gap-2">
          {education.map((ed, i) => (
            <div key={i} className="flex gap-2">
              <input
                className={`${inputClass} flex-1`}
                placeholder="Institution"
                value={ed.institution}
                onChange={(e) =>
                  setEducation(
                    education.map((x, j) => (j === i ? { ...x, institution: e.target.value } : x)),
                  )
                }
              />
              <input
                className={`${inputClass} flex-1`}
                placeholder="Degree"
                value={ed.degree ?? ""}
                onChange={(e) =>
                  setEducation(
                    education.map((x, j) => (j === i ? { ...x, degree: e.target.value } : x)),
                  )
                }
              />
              <button
                type="button"
                onClick={() => setEducation(education.filter((_, j) => j !== i))}
                className="text-sm text-red-600"
              >
                Remove
              </button>
            </div>
          ))}
          {education.length === 0 && (
            <p className="text-sm text-neutral-500">No education extracted yet.</p>
          )}
        </div>
      </section>

      <section className="flex gap-4">
        <label className="flex flex-1 flex-col gap-1 text-sm">
          Total years of experience
          <input
            className={inputClass}
            type="number"
            name="totalYearsExperience"
            defaultValue={initialTotalYearsExperience ?? ""}
          />
        </label>
        <label className="flex flex-1 flex-col gap-1 text-sm">
          Seniority level
          <select
            className={inputClass}
            name="seniorityLevel"
            defaultValue={initialSeniorityLevel ?? ""}
          >
            <option value="">—</option>
            <option value="entry">Entry</option>
            <option value="mid">Mid</option>
            <option value="senior">Senior</option>
            <option value="staff">Staff</option>
            <option value="principal">Principal</option>
            <option value="exec">Executive</option>
          </select>
        </label>
      </section>

      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state.success && <p className="text-sm text-green-600">Saved.</p>}

      <button
        type="submit"
        disabled={pending}
        className="self-start rounded bg-neutral-900 px-4 py-2 text-white disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900"
      >
        {pending ? "Saving…" : "Save corrections"}
      </button>
    </form>
  );
}
