import { useProjects } from './useProjects';

export function ProjectList() {
  const { data: projects, isPending, isError } = useProjects();
  if (isPending) return <p>Loading projects…</p>;
  if (isError) return <p role="alert">The projects could not be loaded.</p>;
  return (
    <ul>
      {projects.map(project => (
        <li key={project.id}>{project.name}</li>
      ))}
    </ul>
  );
}
