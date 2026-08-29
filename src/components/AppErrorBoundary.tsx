import React, { ErrorInfo, ReactNode } from "react";
import PhoneFrame from "./PhoneFrame";
import WeatherError from "./WeatherError";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  errorMessage: string;
}

export default class AppErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      errorMessage: "Wystąpił krytyczny błąd podczas ładowania aplikacji."
    };
  }

  public static getDerivedStateFromError(error: Error): State {
    return { 
      hasError: true,
      errorMessage: error?.message || "Wystąpił krytyczny błąd podczas ładowania aplikacji."
    };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("App caught an error:", error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <PhoneFrame>
          <WeatherError 
            message={this.state.errorMessage} 
            onRetry={() => {
              try {
                localStorage.removeItem("aura_last_weather");
                localStorage.removeItem("aura_last_sync_time");
                localStorage.removeItem("aura_last_method");
              } catch (e) {}
              window.location.reload();
            }} 
          />
        </PhoneFrame>
      );
    }
    return this.props.children;
  }
}
