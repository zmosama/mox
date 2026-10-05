/**
 * "Something funny", "an action film": Ask MOX's moods, and the iPad's Browse
 * tiles. TMDB genre ids for films and for series — TMDB numbers its TV genres
 * differently, and some moods have no series genre at all.
 */
export const MOODS: Record<string, { movie: number | null; tv: number | null }> = {
  comedy: { movie: 35, tv: 35 },
  action: { movie: 28, tv: 10759 },
  drama: { movie: 18, tv: 18 },
  thriller: { movie: 53, tv: 9648 },
  scifi: { movie: 878, tv: 10765 },
  horror: { movie: 27, tv: null },
  romance: { movie: 10749, tv: null },
  animation: { movie: 16, tv: 16 },
  crime: { movie: 80, tv: 80 },
  documentary: { movie: 99, tv: 99 },
};

export const MOOD_LABELS: Record<keyof typeof MOODS & string, string> = {
  comedy: "Comedy",
  action: "Action",
  drama: "Drama",
  thriller: "Thriller",
  scifi: "Sci-Fi",
  horror: "Horror",
  romance: "Romance",
  animation: "Animation",
  crime: "Crime",
  documentary: "Documentary",
};
