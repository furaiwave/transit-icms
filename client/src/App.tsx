import { useEffect, useMemo, useState, type JSX } from 'react';
import type { HistoryPoint, VehicleId, VehicleSnapshot } from '@icms/shared';
import { AnomalyLog } from '@/components/AnomalyLog';
import { DispatchPanel } from '@/components/DispatchPanel';
import { EtaBoard } from '@/components/EtaBoard';
import { Header } from '@/components/Header';
import { ResultsPage } from '@/components/ResultsPage';
import { SchematicMap } from '@/components/SchematicMap';
import { SpeedChart } from '@/components/SpeedChart';
import { StatsCards } from '@/components/Stats';
import { VehicleList } from '@/components/VehicleList';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useApiQuery } from '@/hooks/useApiQuery';
import { useHashRoute } from '@/hooks/useHashRoute';
import { useTelemetryFeed } from '@/hooks/useTelemetryFeed';

const TRACE_LIMIT = 180;

const snapshotToTracePoint = (s: VehicleSnapshot): HistoryPoint => ({
  ts: s.updatedAt,
  rawSpeedKmh: s.raw.speedKmh,
  filteredSpeedKmh: s.filtered.speedKmh,
  rawLat: s.raw.lat,
  rawLon: s.raw.lon,
  filteredLat: s.filtered.lat,
  filteredLon: s.filtered.lon,
  anomaly: s.lastAnomaly,
});

export const App = (): JSX.Element => {
  const [route, navigate] = useHashRoute();
  const feed = useTelemetryFeed();
  const { data: routes } = useApiQuery('GET /api/routes');
  const [selectedId, setSelectedId] = useState<VehicleId | null>(null);
  const [trace, setTrace] = useState<readonly HistoryPoint[]>([]);

  const vehicles = useMemo(
    () => [...feed.vehicles.values()].sort((a, b) => a.vehicleId.localeCompare(b.vehicleId)),
    [feed.vehicles],
  );
  const selected = selectedId ? (feed.vehicles.get(selectedId) ?? null) : null;

  useEffect(() => setTrace([]), [selectedId]);
  const selectedTs = selected?.updatedAt ?? 0;
  useEffect(() => {
    if (!selected) return;
    setTrace((prev) => [...prev, snapshotToTracePoint(selected)].slice(-TRACE_LIMIT));
    // нова точка траси — новий кадр обраного борту
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTs, selectedId]);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <Header connected={feed.connected} stats={feed.stats} route={route} onNavigate={navigate} />
      {route === 'results' ? (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <ResultsPage />
        </div>
      ) : (
      <main className="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-hidden p-3 xl:grid-cols-[minmax(0,1fr)_400px]">
        <section className="flex min-h-0 flex-col gap-3 overflow-hidden">
          <div className="min-h-0 flex-1">
            <SchematicMap
              routes={routes ?? []}
              vehicles={vehicles}
              selectedId={selectedId}
              selectedHistory={trace}
              onSelect={setSelectedId}
            />
          </div>
          {selectedId && <SpeedChart vehicleId={selectedId} live={selected} />}
        </section>

        <aside className="flex min-h-0 flex-col gap-3 overflow-y-auto">
          <StatsCards stats={feed.stats} />
          <Card>
            <CardHeader>
              <CardTitle>Оперативний стан</CardTitle>
            </CardHeader>
            <CardContent className="pt-1">
              <Tabs defaultValue="vehicles">
                <TabsList>
                  <TabsTrigger value="vehicles">Борти</TabsTrigger>
                  <TabsTrigger value="anomalies">Аномалії</TabsTrigger>
                  <TabsTrigger value="eta">Табло ETA</TabsTrigger>
                </TabsList>
                <TabsContent value="vehicles">
                  <VehicleList
                    vehicles={vehicles}
                    routes={routes ?? []}
                    selectedId={selectedId}
                    onSelect={setSelectedId}
                  />
                </TabsContent>
                <TabsContent value="anomalies">
                  <AnomalyLog anomalies={feed.anomalies} />
                </TabsContent>
                <TabsContent value="eta">
                  <EtaBoard />
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
          <DispatchPanel
            selectedId={selectedId}
            simulationRunning={feed.stats?.simulationRunning ?? false}
            lastAck={feed.lastAck}
          />
        </aside>
      </main>
      )}
    </div>
  );
};