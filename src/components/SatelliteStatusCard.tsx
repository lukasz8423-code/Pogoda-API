import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Orbit, Radio, Signal, RefreshCw, ChevronDown, ChevronUp, Globe, Activity } from "lucide-react";

interface SatelliteStatusCardProps {
  locationName?: string;
  soilMoistureSat?: number;
  cloudCoverSat?: number;
}

export default function SatelliteStatusCard({
  locationName = "Lokalizacja",
  soilMoistureSat = 25,
  cloudCoverSat = 35,
}: SatelliteStatusCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<"all" | "esa" | "eumetsat" | "nasa">("all");
  const [pinging, setPinging] = useState(false);
  const [lastPingTime, setLastPingTime] = useState<string>("przed chwilą");
  const [expandedSatId, setExpandedSatId] = useState<string | null>(null);

  const satellites = [
    {
      id: "sentinel-1",
      name: "Copernicus Sentinel-1A / 1B",
      agency: "ESA (Europejska Agencja Kosmiczna)",
      agencyGroup: "esa",
      type: "LEO (Orbita Polarna - 693 km)",
      sensor: "C-SAR (Radar z Syntetyczną Aperturą mikrofalową)",
      provides: "Modelowanie wilgotności gleby na podst. danych radarowych (0-1 cm)",
      status: "ONLINE",
      frequency: "Aktualizacja co 1-3 godz. (Model Open-Meteo)",
      liveMetric: `Wilgotność gleby: ${soilMoistureSat}%`,
      iconBg: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40",
      description: "Analiza radarowa odbicia mikrofalowego od cząsteczek wody w glebie, przetworzona przez model Open-Meteo dla warstwy 0-1 cm."
    },
    {
      id: "meteosat",
      name: "Meteosat Third Generation (MTG-I1 / SEVIRI)",
      agency: "EUMETSAT (Europejski Satelita Meteorologiczny)",
      agencyGroup: "eumetsat",
      type: "GEO (Geostacjonarna - 35 786 km nad Równikiem)",
      sensor: "FCI / SEVIRI Multispectral Radiometer",
      provides: "Obrazowanie zachmurzenia na żywo, radary burzowe, fronty atmosferyczne",
      status: "ONLINE",
      frequency: "Skany co 10-60 minut (Model EUMETSAT/MET Norway)",
      liveMetric: `Zachmurzenie: ${cloudCoverSat}%`,
      iconBg: "bg-blue-500/20 text-blue-300 border-blue-500/40",
      description: "Zawieszona nieruchomo nad Afryką i Europą potężna platforma kosmiczna monitorująca cyrkulację mas powietrza i narodziny burz."
    },
    {
      id: "smos",
      name: "SMOS (Soil Moisture and Ocean Salinity)",
      agency: "ESA / CNES",
      agencyGroup: "esa",
      type: "LEO (Orbita Polarna - 758 km)",
      sensor: "MIRAS (Radiometr mikrofalowy pasma L 1.4 GHz)",
      provides: "Globalny bilans hydrologiczny gleby i wskaźniki suszy rolniczej",
      status: "ONLINE",
      frequency: "Ciągła telemetria mikrofalowa",
      liveMetric: `Indeks nawodnienia: ${soilMoistureSat > 30 ? "Optymalny" : "Podwyższone ryzyko suszy"}`,
      iconBg: "bg-cyan-500/20 text-cyan-300 border-cyan-500/40",
      description: "Specjalistyczny satelita stworzony przez ESA do wyznaczania zawartości wilgoci w wierzchniej warstwie skorupy ziemskiej."
    },
    {
      id: "sentinel-5p",
      name: "Copernicus Sentinel-5P / Sentinel-3",
      agency: "ESA / Unia Europejska",
      agencyGroup: "esa",
      type: "LEO (Orbita Polarna - 815 km)",
      sensor: "TROPOMI / SLSTR Spectrometer",
      provides: "Indeks promieniowania UV, jakość powietrza, warstwa ozonowa, temperatura LST",
      status: "ONLINE",
      frequency: "Pomiary dzienne z korekcją ozonową",
      liveMetric: "Promieniowanie UV i jakość powietrza",
      iconBg: "bg-amber-500/20 text-amber-300 border-amber-500/40",
      description: "Analizuje skład spektrometryczny atmosfery, mierząc natężenie promieniowania ultrafioletowego oraz śladowe gazy."
    },
    {
      id: "metop",
      name: "MetOp-B / MetOp-C",
      agency: "EUMETSAT / ESA",
      agencyGroup: "eumetsat",
      type: "LEO (Orbita Polarna - 817 km)",
      sensor: "ASCAT Scatterometer",
      provides: "Vektory wiatru na powierzchni ziemi oraz profile wilgotności",
      status: "ONLINE",
      frequency: "Ciągłe skanowanie powierzchniowe",
      liveMetric: "Wektory prędkości wiatru",
      iconBg: "bg-indigo-500/20 text-indigo-300 border-indigo-500/40",
      description: "Satelity polarne wyposażone w cyfrowe skaterometry do mierzenia zmarszczenia gruntu i pędu wiatru przy powierzchni."
    },
    {
      id: "aqua-terra",
      name: "NASA Aqua & Terra (MODIS)",
      agency: "NASA (Goddard Space Flight Center)",
      agencyGroup: "nasa",
      type: "LEO (Orbita Polarna - 705 km)",
      sensor: "MODIS (Spektroradiometr Optyczny)",
      provides: "Wskaźnik zieleni roślinności (NDVI) i optyczna kalibracja zachmurzenia",
      status: "ONLINE",
      frequency: "Skany dzienne i nocne",
      liveMetric: "Wskaźniki albedo i wegetacji",
      iconBg: "bg-teal-500/20 text-teal-300 border-teal-500/40",
      description: "Flagowa misja NASA dostarczająca wysoko-rozdzielcze zdjęcia w paśmie widzialnym i podczerwieni do weryfikacji zachmurzenia."
    }
  ];

  const filteredSatellites = satellites.filter(s => activeTab === "all" || s.agencyGroup === activeTab);

  const handlePingSatellites = () => {
    setPinging(true);
    setTimeout(() => {
      setPinging(false);
      setLastPingTime(new Date().toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
    }, 1200);
  };

  return (
    <div 
      className="bg-slate-900/60 backdrop-blur-md border border-slate-800/80 rounded-3xl p-5 shadow-[0_4px_24px_rgba(0,0,0,0.4)] relative overflow-hidden my-6"
      id="satellite-status-card"
    >
      {/* Background ambient orbit lights */}
      <div className="absolute -right-12 -top-12 w-32 h-32 bg-purple-500/10 rounded-full blur-3xl pointer-events-none"></div>
      <div className="absolute -left-12 -bottom-12 w-32 h-32 bg-blue-500/10 rounded-full blur-3xl pointer-events-none"></div>

      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 pb-3 border-b border-slate-800">
        <div className="flex items-center space-x-3">
          <div className="p-2.5 bg-gradient-to-tr from-purple-600 to-indigo-600 rounded-2xl shadow-lg text-white shrink-0 relative">
            <Orbit className="w-5 h-5 animate-spin-slow" />
            <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-emerald-400 rounded-full border-2 border-slate-900 animate-ping"></span>
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h3 className="font-extrabold text-sm text-white tracking-wide">
                Aktywne Połączenia Satelitarne
              </h3>
              <span className="px-2 py-0.5 bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 font-bold text-[10px] rounded-full flex items-center gap-1">
                <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse"></span>
                6 / 6 ONLINE
              </span>
            </div>
            <p className="text-[11px] text-slate-400 font-medium mt-0.5">
              Twoja aplikacja odbiera telemetrię z kosmosu dla: <span className="text-slate-200 font-semibold">{locationName}</span>
            </p>
          </div>
        </div>

        <button
          onClick={handlePingSatellites}
          disabled={pinging}
          className="self-start sm:self-auto px-3 py-1.5 bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700 text-slate-200 text-xs font-bold rounded-xl transition-all flex items-center space-x-1.5 active:scale-95 cursor-pointer"
          id="btn-ping-satellites"
        >
          <RefreshCw className={`w-3.5 h-3.5 text-purple-400 ${pinging ? "animate-spin" : ""}`} />
          <span>{pinging ? "Pinging orbit..." : "Test sygnału"}</span>
        </button>
      </div>

      {/* Overview Stat Badges */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
        <div className="p-2.5 bg-slate-950/50 border border-slate-800/60 rounded-2xl">
          <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">Połączone satelity</p>
          <p className="text-xs font-black text-purple-300 mt-0.5 flex items-center gap-1">
            <Globe className="w-3.5 h-3.5 text-purple-400" /> 6 Konstelacji
          </p>
        </div>

        <div className="p-2.5 bg-slate-950/50 border border-slate-800/60 rounded-2xl">
          <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">Wilgotność gleby SAR</p>
          <p className="text-xs font-black text-emerald-400 mt-0.5 flex items-center gap-1">
            <Radio className="w-3.5 h-3.5 text-emerald-400" /> Sentinel-1 ({soilMoistureSat}%)
          </p>
        </div>

        <div className="p-2.5 bg-slate-950/50 border border-slate-800/60 rounded-2xl">
          <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">Obraz chmur (GEO)</p>
          <p className="text-xs font-black text-blue-300 mt-0.5 flex items-center gap-1">
            <Signal className="w-3.5 h-3.5 text-blue-400" /> Meteosat ({cloudCoverSat}%)
          </p>
        </div>

        <div className="p-2.5 bg-slate-950/50 border border-slate-800/60 rounded-2xl">
          <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">Ostatnia telemetria</p>
          <p className="text-xs font-black text-slate-200 mt-0.5 flex items-center gap-1 truncate">
            <Activity className="w-3.5 h-3.5 text-cyan-400" /> {lastPingTime}
          </p>
        </div>
      </div>

      {/* Main Filter / Expand Button */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center space-x-1.5 overflow-x-auto scrollbar-none py-1">
          <button
            onClick={() => setActiveTab("all")}
            className={`px-2.5 py-1 rounded-xl text-[11px] font-bold transition-all ${
              activeTab === "all"
                ? "bg-purple-600/30 text-purple-200 border border-purple-500/50"
                : "bg-slate-800/50 text-slate-400 hover:text-slate-200"
            }`}
          >
            Wszystkie (6)
          </button>
          <button
            onClick={() => setActiveTab("esa")}
            className={`px-2.5 py-1 rounded-xl text-[11px] font-bold transition-all ${
              activeTab === "esa"
                ? "bg-purple-600/30 text-purple-200 border border-purple-500/50"
                : "bg-slate-800/50 text-slate-400 hover:text-slate-200"
            }`}
          >
            ESA / Copernicus
          </button>
          <button
            onClick={() => setActiveTab("eumetsat")}
            className={`px-2.5 py-1 rounded-xl text-[11px] font-bold transition-all ${
              activeTab === "eumetsat"
                ? "bg-purple-600/30 text-purple-200 border border-purple-500/50"
                : "bg-slate-800/50 text-slate-400 hover:text-slate-200"
            }`}
          >
            EUMETSAT
          </button>
          <button
            onClick={() => setActiveTab("nasa")}
            className={`px-2.5 py-1 rounded-xl text-[11px] font-bold transition-all ${
              activeTab === "nasa"
                ? "bg-purple-600/30 text-purple-200 border border-purple-500/50"
                : "bg-slate-800/50 text-slate-400 hover:text-slate-200"
            }`}
          >
            NASA
          </button>
        </div>

        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="px-3 py-1 bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 border border-purple-500/30 rounded-xl text-xs font-bold transition-all flex items-center space-x-1 shrink-0"
          id="btn-toggle-satellite-details"
        >
          <span>{isExpanded ? "Zwiń listę" : "Pokaż parametry"}</span>
          {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>
      </div>

      {/* Satellites List */}
      <div className="mt-3 space-y-2.5">
        {filteredSatellites.slice(0, isExpanded ? filteredSatellites.length : 2).map((sat) => {
          const isSatExpanded = expandedSatId === sat.id;

          return (
            <div
              key={sat.id}
              className="p-3 bg-slate-950/60 border border-slate-800/80 rounded-2xl hover:border-slate-700 transition-all"
            >
              <div 
                className="flex items-center justify-between cursor-pointer"
                onClick={() => setExpandedSatId(isSatExpanded ? null : sat.id)}
              >
                <div className="flex items-center space-x-3 min-w-0">
                  <div className={`p-2 rounded-xl border ${sat.iconBg} shrink-0`}>
                    <Orbit className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center space-x-2">
                      <h4 className="text-xs font-bold text-slate-100 truncate">{sat.name}</h4>
                      <span className="px-1.5 py-0.5 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[9px] font-extrabold rounded-md">
                        {sat.status}
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-400 font-medium truncate mt-0.5">
                      {sat.agency} &bull; <span className="text-purple-300 font-semibold">{sat.type}</span>
                    </p>
                  </div>
                </div>

                <div className="text-right shrink-0 ml-2">
                  <p className="text-xs font-black text-slate-200">{sat.liveMetric}</p>
                  <p className="text-[9px] text-slate-500 font-medium">{sat.frequency}</p>
                </div>
              </div>

              {/* Extended Details */}
              <AnimatePresence>
                {(isSatExpanded || isExpanded) && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="mt-3 pt-2.5 border-t border-slate-800/60 space-y-2 text-xs"
                  >
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                      <div className="p-2 bg-slate-900/50 rounded-xl border border-slate-800">
                        <span className="text-slate-500 font-semibold block text-[9px] uppercase">Główny Sensor</span>
                        <span className="text-slate-200 font-bold">{sat.sensor}</span>
                      </div>
                      <div className="p-2 bg-slate-900/50 rounded-xl border border-slate-800">
                        <span className="text-slate-500 font-semibold block text-[9px] uppercase">Zakres Pomiarowy</span>
                        <span className="text-purple-300 font-bold">{sat.provides}</span>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>

      {!isExpanded && filteredSatellites.length > 2 && (
        <div className="mt-2 text-center">
          <button
            onClick={() => setIsExpanded(true)}
            className="text-[11px] text-purple-400 hover:text-purple-300 font-bold py-1 px-3 hover:bg-purple-500/10 rounded-xl transition-all"
          >
            + Zobacz pozostałe {filteredSatellites.length - 2} połączone satelity
          </button>
        </div>
      )}
    </div>
  );
}
