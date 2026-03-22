import { DecimalPipe } from '@angular/common';
import { Component, signal } from '@angular/core';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [DecimalPipe],
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

  public trackingStarted = signal<boolean>(false);
  public isSidebarOpen = signal<boolean>(false);

  public currentIndex = 0;
  private watchId: number | null = null;

  async selectAndStart(fileName: string) {
    try {
      const res = await fetch(`routes/${fileName}`);
      if (!res.ok) throw new Error();
      this.railwayData = await res.json();
      this.currentIndex = 0;
      this.activeTarget.set(this.railwayData[0]);
      this.trackingStarted.set(true);
      this.startTracking();
    } catch (e) {
      alert('Navigation Data Error: File not found.');
    }
  }

  private startTracking() {
    if (navigator.geolocation) {
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
  }

  private processNavigation(uLat: number, uLng: number) {
    if (!this.railwayData.length) return;
    const target = this.railwayData[this.currentIndex];
    const dist = this.calculateMeters(uLat, uLng, target.latitude, target.longitude);

    if (dist <= 100 && this.currentIndex < this.railwayData.length - 1) {
      this.lastPassed.set(this.railwayData[this.currentIndex]);
      this.currentIndex++;
      this.activeTarget.set(this.railwayData[this.currentIndex]);
    }
    this.distanceToTarget.set(dist);
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
    this.trackingStarted.set(false);
    this.lastPassed.set(null);
    this.currentIndex = 0;
  }

  toggleSidebar() {
    this.isSidebarOpen.set(!this.isSidebarOpen());
  }
}
