import { ReactNode } from "react";

interface PhoneFrameProps {
  children: ReactNode;
}

export default function PhoneFrame({ children }: PhoneFrameProps) {
  return (
    <div className="min-h-screen bg-slate-950 flex justify-center font-sans antialiased text-white">
      {/* Responsive App Container */}
      <div className="w-full max-w-md min-h-screen bg-zinc-950 flex flex-col relative overflow-x-hidden shadow-2xl">
        {children}
      </div>
    </div>
  );
}
