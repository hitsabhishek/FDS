import { CommonModule, DecimalPipe } from '@angular/common';
import { Component, signal } from '@angular/core';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [DecimalPipe, CommonModule],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  public availableRoutes: string[] = Array.from({ length: 32 }, (_, i) => `ROUTE${i + 1}.json`);
  public railwayData: any[] = [];

  public activeTarget = signal<any>(null);
  public lastPassed = signal<any>(null);
  public distanceToTarget = signal<number>(0);
  public currentSpeed = signal<number>(0);
  public gpsAccuracy = signal<number>(0);
  public isMuted = signal<boolean>(false);

  public trackingStarted = signal<boolean>(false);
  public isSidebarOpen = signal<boolean>(false);

  public currentIndex = 0;
  private watchId: number | null = null;
  private synth = window.speechSynthesis;

  async selectAndStart(fileName: string) {
    try {
      // 1. Pehle screen switch karo
      this.trackingStarted.set(true);

      // 2. Data load hone ka wait karo (WAIT IS CRITICAL)
      const res = await fetch(`./routes/${fileName}`);
      if (!res.ok) throw new Error('File not found');

      this.railwayData = await res.json();

      // 3. Default index set karo safe side ke liye
      this.currentIndex = 0;
      this.activeTarget.set(this.railwayData[0]);

      // 4. Ab data mil gaya hai, toh Nearest Station dhundo
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const { latitude, longitude } = pos.coords;
          let nearestIdx = 0;
          let minDistance = Infinity;

          // Loop through all points in the JSON
          this.railwayData.forEach((point, index) => {
            const d = this.calculateMeters(latitude, longitude, point.latitude, point.longitude);
            if (d < minDistance) {
              minDistance = d;
              nearestIdx = index;
            }
          });

          // Jump directly to the nearest station
          this.currentIndex = nearestIdx;
          this.activeTarget.set(this.railwayData[this.currentIndex]);

          // Voice alert context ke hisab se
          const msg =
            minDistance > 200
              ? `Route joined. Nearest point is ${this.activeTarget().event}`
              : `Navigation started at ${this.activeTarget().event}`;
          this.announce(msg);

          // Continuous tracking start karo
          this.startTracking();
        },
        (err) => {
          console.warn('GPS timeout or denied, starting from first station.');
          this.startTracking();
        },
        { enableHighAccuracy: true, timeout: 5000 },
      );
    } catch (e) {
      this.trackingStarted.set(false);
      alert('Error: Route data fetch failed.');
    }
  }

  private startTracking() {
    if (this.watchId) navigator.geolocation.clearWatch(this.watchId);

    this.watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude, speed, accuracy } = pos.coords;
        this.currentSpeed.set(speed ? speed * 3.6 : 0);
        this.gpsAccuracy.set(accuracy || 0);
        this.processNavigation(latitude, longitude);
      },
      null,
      { enableHighAccuracy: true },
    );
  }

  private processNavigation(uLat: number, uLng: number) {
    if (!this.railwayData.length) return;
    const target = this.railwayData[this.currentIndex];
    const dist = this.calculateMeters(uLat, uLng, target.latitude, target.longitude);
    this.distanceToTarget.set(dist);

    // Auto-advance logic (100m range)
    if (dist <= 100 && this.currentIndex < this.railwayData.length - 1) {
      this.lastPassed.set(this.railwayData[this.currentIndex]);
      this.currentIndex++;
      this.activeTarget.set(this.railwayData[this.currentIndex]);
      this.announce(
        `Arriving at ${this.lastPassed().event}. Next target ${this.activeTarget().event}`,
      );
    }
  }

  private announce(text: string) {
    if (this.isMuted() || !this.synth) return;
    this.synth.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    // Voice selection logic
    const voices = this.synth.getVoices();
    utter.voice =
      voices.find((v) => v.name.includes('Google') || v.name.includes('Samantha')) || voices[0];
    utter.rate = 0.95;
    this.synth.speak(utter);
  }

  private calculateMeters(lat1: number, lon1: number, lat2: number, lon2: number) {
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 1000;
  }

  stopNavigation() {
    if (this.watchId) navigator.geolocation.clearWatch(this.watchId);
    this.synth.cancel();
    this.trackingStarted.set(false);
    this.lastPassed.set(null);
  }

  toggleMute() {
    this.isMuted.set(!this.isMuted());
  }
  toggleSidebar() {
    this.isSidebarOpen.set(!this.isSidebarOpen());
  }
}
