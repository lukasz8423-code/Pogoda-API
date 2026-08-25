import { ReactNode } from "react";

interface PhoneFrameProps {
  children: ReactNode;
}

export default function PhoneFrame({ children }: PhoneFrameProps) {
  return (
    <div className="min-h-screen bg-[#070b16] flex justify-center font-sans antialiased text-slate-100 selection:bg-blue-500/40 selection:text-white">
      {/* Responsive App Container */}
      <div className="w-full max-w-lg md:max-w-3xl lg:max-w-5xl min-h-screen flex flex-col relative overflow-x-hidden shadow-2xl transition-all duration-300">
        {children}
      </div>
    </div>
  );
}

