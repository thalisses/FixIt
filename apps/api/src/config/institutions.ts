export const institutions = [
  { id: "UEM", name: "Universidade Estadual de Maringá - UEM" },
] as const;

export type InstitutionId = (typeof institutions)[number]["id"];

export function isInstitutionId(value: unknown): value is InstitutionId {
  return (
    typeof value === "string" &&
    institutions.some((institution) => institution.id === value)
  );
}
