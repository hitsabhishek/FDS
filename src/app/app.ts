import { CommonModule, DecimalPipe } from '@angular/common';
import { Component, OnDestroy, OnInit, signal } from '@angular/core';

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
  private watchId: number | null = null;
  private clockInterval: any;
  private synth = window.speechSynthesis;

  // ngOnInit() {
  //   this.updateTime();
  //   this.clockInterval = setInterval(() => this.updateTime(), 1000);
  // }

  ngOnInit() {
    this.updateTime();
    this.clockInterval = setInterval(() => this.updateTime(), 1000);

    // Chrome Voice Load Fix
    window.speechSynthesis.onvoiceschanged = () => {
      console.log('Voices Loaded:', window.speechSynthesis.getVoices().length);
    };
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

  // async selectAndStart(fileName: string) {
  //   try {
  //     this.isSidebarOpen.set(false); // Close sidebar if switching routes
  //     this.trackingStarted.set(true);

  //     const res = await fetch(`./routes/${fileName}`);
  //     if (!res.ok) throw new Error('File Error');
  //     this.railwayData = await res.json();

  //     this.currentIndex = 0;
  //     this.activeTarget.set(this.railwayData[0]);

  //     navigator.geolocation.getCurrentPosition(
  //       (pos) => {
  //         const { latitude, longitude } = pos.coords;
  //         let nearestIdx = 0;
  //         let minDistance = Infinity;

  //         this.railwayData.forEach((point, index) => {
  //           const d = this.calculateMeters(latitude, longitude, point.latitude, point.longitude);
  //           if (d < minDistance) {
  //             minDistance = d;
  //             nearestIdx = index;
  //           }
  //         });

  //         this.currentIndex = nearestIdx;
  //         this.activeTarget.set(this.railwayData[this.currentIndex]);
  //         this.announce(`Locked on ${this.activeTarget().event}`);
  //         this.startTracking();
  //       },
  //       () => this.startTracking(),
  //       { enableHighAccuracy: true, timeout: 5000 },
  //     );
  //   } catch (e) {
  //     this.trackingStarted.set(false);
  //     alert('Failed to load route data from public/routes/');
  //   }
  // }

  async selectAndStart(fileName: string) {
    try {
      this.isSidebarOpen.set(false);
      this.trackingStarted.set(true);

      const res = await fetch(`./routes/${fileName}`);
      if (!res.ok) throw new Error('File Error');
      this.railwayData = await res.json();

      this.currentIndex = 0;
      this.alertDone = false; // <--- Yeh line add kar lo taaki naya route fresh start ho
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
          this.alertDone = false; // <--- Nearest station set hone ke baad bhi reset safe hai
          this.announce(`Locked on ${this.activeTarget().event}`);
          this.startTracking();
        },
        () => this.startTracking(),
        { enableHighAccuracy: true, timeout: 5000 },
      );
    } catch (e) {
      this.trackingStarted.set(false);
      alert('Failed to load route data from public/routes/');
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

  // private processNavigation(uLat: number, uLng: number) {
  //   if (!this.railwayData.length) return;
  //   const target = this.railwayData[this.currentIndex];
  //   const dist = this.calculateMeters(uLat, uLng, target.latitude, target.longitude);
  //   this.distanceToTarget.set(dist);

  //   if (dist <= 150 && this.currentIndex < this.railwayData.length - 1) {
  //     this.lastPassed.set(this.railwayData[this.currentIndex]);
  //     this.currentIndex++;
  //     this.activeTarget.set(this.railwayData[this.currentIndex]);
  //     this.announce(`Approaching ${this.lastPassed().event}`);
  //   }
  // }

  // public currentIndex = 0;
  private alertDone = false; // Yeh line add karein target change hone ke beech alert control karne ke liye

  private processNavigation(uLat: number, uLng: number) {
    if (!this.railwayData.length) return;
    const target = this.railwayData[this.currentIndex];
    const dist = this.calculateMeters(uLat, uLng, target.latitude, target.longitude);
    this.distanceToTarget.set(dist);

    // --- 1. CALL OUT LOGIC (500 Meters) ---
    // Jab doori 500m se kam ho aur alert abhi tak na hua ho
    if (dist <= 500 && dist > 5 && !this.alertDone) {
      this.announce(`Approaching ${target.event}. Five hundred meters remaining.`);
      this.alertDone = true;
    }

    // --- 2. PASSING LOGIC (05 Meters) ---
    // Jab doori 5m se kam ho, tabhi agle target par switch karein
    if (dist <= 5 && this.currentIndex < this.railwayData.length - 1) {
      this.lastPassed.set(this.railwayData[this.currentIndex]);
      this.currentIndex++;
      this.activeTarget.set(this.railwayData[this.currentIndex]);

      // Naye target ke liye alert flag reset karein
      this.alertDone = false;

      // Sidebar ko naye active item par scroll karein
      setTimeout(() => {
        const el = document.querySelector('.item.on');
        el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 100);
    }
  }

  // private announce(text: string) {
  //   if (this.isMuted() || !this.synth) return;
  //   this.synth.cancel();
  //   const utter = new SpeechSynthesisUtterance(text);
  //   const voices = this.synth.getVoices();
  //   utter.voice =
  //     voices.find((v) => v.name.includes('Google') || v.name.includes('Samantha')) || voices[0];
  //   utter.rate = 0.9;
  //   this.synth.speak(utter);
  // }

  private announce(text: string) {
    if (this.isMuted() || !this.synth) return;

    this.synth.cancel(); // Purani speech ko turant roko
    const utter = new SpeechSynthesisUtterance(text);

    // Saari available voices nikaalein
    const voices = this.synth.getVoices();

    // 1. Sabse pehle "Google" voices ko target karein (Ye kaafi natural hoti hain)
    // 2. Phir "Natural" ya "Premium" keyword wali voices check karein
    let selectedVoice = voices.find((v) => v.name.includes('Google') && v.lang.includes('en'));

    if (!selectedVoice) {
      selectedVoice = voices.find(
        (v) => v.name.includes('Samantha') || v.name.includes('Microsoft Ravi'),
      );
    }

    if (selectedVoice) {
      utter.voice = selectedVoice;
    }

    // Awaaz ko "Insaan" jaisa banane ke liye parameters:
    utter.rate = 0.85; // Thoda dheere (Loco pilot ko samajhne mein aasani hogi)
    utter.pitch = 1.0; // Normal pitch (Zyada high hone par robotic lagti hai)
    utter.volume = 1.0;

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

  toggleMute() {
    this.isMuted.set(!this.isMuted());
  }
  toggleSidebar() {
    this.isSidebarOpen.set(!this.isSidebarOpen());
  }
}
