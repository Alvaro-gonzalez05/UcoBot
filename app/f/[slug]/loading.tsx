export default function FormLoading() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 md:p-8 bg-black">
      <div className="w-full max-w-2xl flex flex-col gap-4 animate-pulse">
        {/* Header skeleton */}
        <div className="rounded-2xl p-6" style={{ backgroundColor: "#1e202c" }}>
          <div className="h-7 w-48 rounded-lg bg-white/10 mb-2" />
          <div className="h-4 w-72 rounded-lg bg-white/5" />
        </div>
        {/* Step skeleton */}
        <div className="rounded-2xl p-6 flex flex-col gap-5" style={{ backgroundColor: "#1e202c" }}>
          <div className="h-6 w-40 rounded-lg bg-white/10" />
          <div className="flex flex-col gap-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="flex flex-col gap-1.5">
                <div className="h-3 w-24 rounded bg-white/10" />
                <div className="h-11 w-full rounded-lg bg-white/5" />
              </div>
            ))}
          </div>
          <div className="flex justify-end">
            <div className="h-11 w-32 rounded-full bg-white/10" />
          </div>
        </div>
      </div>
    </div>
  )
}
