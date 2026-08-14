import React, { ErrorInfo, ReactNode } from "react";
import PhoneFrame from "./PhoneFrame";
import WeatherError from "./WeatherError";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

export default class AppErrorBoundary extends React.Component<Props, State> {
  public props!: Props;
  public state: State = {
    hasError: false
  };

  public static getDerivedStateFromError(_: Error): State {
    return { hasError: true };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("App caught an error:", error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <PhoneFrame>
          <WeatherError message="Wystąpił krytyczny błąd podczas ładowania aplikacji." onRetry={() => window.location.reload()} />
        </PhoneFrame>
      );
    }
    return this.props.children;
  }
}
