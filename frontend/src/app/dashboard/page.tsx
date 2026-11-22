export default function Dashboard() {
  return (
    <main className="p-6 space-y-4">
      <h1 className="text-2xl font-bold">XreyStudioServer Admin</h1>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded border p-4">Users: 0</div>
        <div className="rounded border p-4">Nodes: 0</div>
        <div className="rounded border p-4">Traffic: 0 GB</div>
      </div>
    </main>
  );
}