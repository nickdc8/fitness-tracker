import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Workout Tracker",
    short_name: "Workout",
    description: "Track and archive workouts from uploaded CSV programs",
    start_url: "/",
    display: "standalone",
    background_color: "#f5f1e9",
    theme_color: "#123f37",
    orientation: "portrait",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
      },
    ],
  };
}
