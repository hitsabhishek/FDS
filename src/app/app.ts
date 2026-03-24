import { CommonModule, DecimalPipe } from '@angular/common';
import { Component, signal, OnInit, OnDestroy } from '@angular/core';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [DecimalPipe, CommonModule],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App implements OnInit, OnDestroy {
  public availableRoutes: string[] = Array.from({ length: 32 }, (_, i) => `ROUTE${i + 1}.json`);
  public railwayData: any[] = [];
  public currentTime = signal<string>('');

  public activeTarget = signal<any>(null);
  public lastPassed = signal<any>(null);
  public distanceToTarget = signal<number>(0);
  public currentSpeed = signal<number>(0);
  public gpsAccuracy = signal<number>(0);
  public isMuted = signal<boolean>(false);
  public trackingStarted = signal<boolean>(false);
  public isSidebarOpen = signal<boolean>(false);

  public currentIndex = 0;
  private alertDone = false; // 500m alert track karne ke liye
  private watchId: number | null = null;
  private clockInterval: any;
  private synth = window.speechSynthesis;

  ngOnInit() {
    this.updateTime();
    this.clockInterval = setInterval(() => this.updateTime(), 1000);

    // Chrome/Android Voice Load Fix
    if (this.synth) {
      this.synth.onvoiceschanged = () => {
        console.log('Voices Loaded:', this.synth.getVoices().length);
      };
    }
  }

  ngOnDestroy() {
    if (this.clockInterval) clearInterval(this.clockInterval);
    this.stopNavigation();
  }

  private updateTime() {
    const now = new Date();
    this.currentTime.set(
      now.toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      }),
    );
  }

  async selectAndStart(fileName: string) {
    try {
      this.isSidebarOpen.set(false);
      this.trackingStarted.set(true);

      const res = await fetch(`./routes/${fileName}`);
      if (!res.ok) throw new Error('File Error');
      this.railwayData = await res.json();

      this.currentIndex = 0;
      this.alertDone = false; // Flag reset for new route
      this.activeTarget.set(this.railwayData[0]);

      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const { latitude, longitude } = pos.coords;
          let nearestIdx = 0;
          let minDistance = Infinity;

          this.railwayData.forEach((point, index) => {
            const d = this.calculateMeters(latitude, longitude, point.latitude, point.longitude);
            if (d < minDistance) {
              minDistance = d;
              nearestIdx = index;
            }
          });

          this.currentIndex = nearestIdx;
          this.activeTarget.set(this.railwayData[this.currentIndex]);
          this.alertDone = false; 
          this.announce(`Locked on ${this.activeTarget().event}`);
          this.startTracking();
        },
        () => this.startTracking(),
        { enableHighAccuracy: true, timeout: 5000 },
      );
    } catch (e) {
      this.trackingStarted.set(false);
      alert('Failed to load route data');
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

    // --- 1. CALL OUT LOGIC (500 Meters Alert) ---
    if (dist <= 500 && dist > 15 && !this.alertDone) {
      this.announce(`Approaching ${target.event}. Five hundred meters remaining.`);
      this.alertDone = true; 
    }

    // --- 2. PASSING LOGIC (05 Meters Precision) ---
    if (dist <= 5 && this.currentIndex < this.railwayData.length - 1) {
      this.lastPassed.set(this.railwayData[this.currentIndex]);
      
      // Confirmation Voice
      this.announce(`${this.lastPassed().event} passed.`);
      
      this.currentIndex++;
      this.activeTarget.set(this.railwayData[this.currentIndex]);
      this.alertDone = false; // Reset alert for the next upcoming station

      // Sidebar Auto-scroll to active item
      setTimeout(() => {
        const activeItem = document.querySelector('.item.on');
        activeItem?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 100);
    }
  }

  private announce(text: string) {
    if (this.isMuted() || !this.synth) return;
    
    this.synth.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    const voices = this.synth.getVoices();

    // Natural Voice Selection
    let selectedVoice = voices.find(v => v.name.includes('Google') && v.lang.includes('en'));
    if (!selectedVoice) {
      selectedVoice = voices.find(v => v.name.includes('Samantha') || v.name.includes('Microsoft Ravi'));
    }

    if (selectedVoice) utter.voice = selectedVoice;
    
    utter.rate = 0.85; // Natural human speed
    utter.pitch = 1.0;
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
  }

  toggleMute() { this.isMuted.set(!this.isMuted()); }
  toggleSidebar() { this.isSidebarOpen.set(!this.isSidebarOpen()); }
}