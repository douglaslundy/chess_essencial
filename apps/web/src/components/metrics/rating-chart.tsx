export interface RatingPoint {
  date: string;
  rating: number;
}

const WIDTH = 640;
const HEIGHT = 220;
const PAD = { bottom: 28, left: 44, right: 12, top: 12 };

/** Line chart of the rating over time (inline SVG): green dots are rises, red dots are drops. */
export function RatingChart({ points }: { points: readonly RatingPoint[] }) {
  if (points.length < 2) {
    return <p>Jogue mais partidas valendo rating para ver o gráfico da sua evolução.</p>;
  }
  const ratings = points.map((point) => point.rating);
  const min = Math.min(...ratings);
  const max = Math.max(...ratings);
  const span = Math.max(max - min, 20);
  const low = min - span * 0.1;
  const high = max + span * 0.1;
  const x = (index: number) =>
    PAD.left + (index / (points.length - 1)) * (WIDTH - PAD.left - PAD.right);
  const y = (rating: number) =>
    PAD.top + (1 - (rating - low) / (high - low)) * (HEIGHT - PAD.top - PAD.bottom);
  const path = points
    .map((point, i) => `${i === 0 ? 'M' : 'L'}${x(i)},${y(point.rating)}`)
    .join(' ');
  const first = points[0]!;
  const last = points[points.length - 1]!;
  const gridValues = [low + (high - low) * 0.1, (low + high) / 2, high - (high - low) * 0.1];

  return (
    <figure className="ratingChart">
      <svg
        aria-label={`Gráfico do rating: de ${first.rating} para ${last.rating} em ${points.length} partidas`}
        role="img"
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      >
        {gridValues.map((value) => (
          <g key={value}>
            <line
              stroke="currentColor"
              strokeOpacity="0.15"
              x1={PAD.left}
              x2={WIDTH - PAD.right}
              y1={y(value)}
              y2={y(value)}
            />
            <text
              fill="currentColor"
              fontSize="11"
              textAnchor="end"
              x={PAD.left - 6}
              y={y(value) + 4}
            >
              {Math.round(value)}
            </text>
          </g>
        ))}
        <path d={path} fill="none" stroke="#7cc4ff" strokeWidth="2" />
        {points.map((point, i) => {
          const previous = points[i - 1];
          const color = !previous
            ? '#7cc4ff'
            : point.rating >= previous.rating
              ? '#22c55e'
              : '#ef4444';
          return (
            <circle cx={x(i)} cy={y(point.rating)} fill={color} key={`${point.date}-${i}`} r="3.5">
              <title>{`${new Date(point.date).toLocaleDateString('pt-BR')}: ${point.rating}`}</title>
            </circle>
          );
        })}
        <text fill="currentColor" fontSize="11" x={PAD.left} y={HEIGHT - 8}>
          {new Date(first.date).toLocaleDateString('pt-BR')}
        </text>
        <text
          fill="currentColor"
          fontSize="11"
          textAnchor="end"
          x={WIDTH - PAD.right}
          y={HEIGHT - 8}
        >
          {new Date(last.date).toLocaleDateString('pt-BR')}
        </text>
      </svg>
    </figure>
  );
}
