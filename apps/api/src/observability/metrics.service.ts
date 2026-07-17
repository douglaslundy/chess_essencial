import { Injectable } from '@nestjs/common';

type Labels = Record<string, string>;

@Injectable()
export class MetricsService {
  private readonly counters = new Map<string, number>();
  private readonly startedAt = Date.now();

  increment(name: string, labels: Labels = {}, amount = 1) {
    const key = this.key(name, labels);
    this.counters.set(key, (this.counters.get(key) ?? 0) + amount);
  }

  render() {
    const lines = [
      '# HELP xadrez_api_uptime_seconds API process uptime.',
      '# TYPE xadrez_api_uptime_seconds gauge',
      `xadrez_api_uptime_seconds ${Math.floor((Date.now() - this.startedAt) / 1000)}`,
    ];
    for (const [key, value] of [...this.counters.entries()].sort(([a], [b]) =>
      a.localeCompare(b),
    )) {
      lines.push(`${key} ${value}`);
    }
    return `${lines.join('\n')}\n`;
  }

  private key(name: string, labels: Labels) {
    const entries = Object.entries(labels).sort(([a], [b]) => a.localeCompare(b));
    if (entries.length === 0) return name;
    const rendered = entries
      .map(([key, value]) => `${key}="${value.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`)
      .join(',');
    return `${name}{${rendered}}`;
  }
}
