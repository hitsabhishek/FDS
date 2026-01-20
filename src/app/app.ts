import { Component, signal, OnInit } from '@angular/core';
import { DecimalPipe,} from '@angular/common';
import * as L from 'leaflet';

// Fix for Leaflet Default Icons (404 Error Solution)
const iconDefault = L.icon({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41]
});
L.Marker.prototype.options.icon = iconDefault;

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [ DecimalPipe],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App implements OnInit {
  public availableRoutes: string[] = ['DHN-DDU.json'];
  public railwayData: any[] = [];
  
  public nextTarget = signal<any>(null);
  public distanceToTarget = signal<number>(0);
  public currentSpeed = signal<number>(0);
  public isMuted = signal<boolean>(false);
  public trackingStarted = signal<boolean>(false);
  public currentIndex = 0; 

  private map!: L.Map;
  private userMarker!: L.Marker;
  private proximityAnnounced = false;
  private lastAnnouncedId: number | null = null;

  ngOnInit() { this.initMap(); }

  private initMap() {
    this.map = L.map('map', { zoomControl: false }).setView([23.5, 80.0], 5);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(this.map);
  }

  private speak(text: string) {
    if (this.isMuted()) return;
    window.speechSynthesis.cancel();
    const msg = new SpeechSynthesisUtterance(text);
    msg.rate = 0.9;
    window.speechSynthesis.speak(msg);
  }

  async selectAndStart(fileName: string) {
    try {
      const res = await fetch(fileName);
      this.railwayData = await res.json();
      this.currentIndex = 0;
      this.trackingStarted.set(true);
      
      if (this.railwayData.length > 0) {
        const start = this.railwayData[0];
        this.map.flyTo([start["Converted Latitude (in degree decimal)"], start["Converted Longitude (in degree decimal)"]], 16);
      }
      this.trackUser();
      this.speak("Route active. System ready.");
    } catch (e) { console.error('File Error'); }
  }

  private trackUser() {
    if (navigator.geolocation) {
      navigator.geolocation.watchPosition((pos) => {
        const { latitude, longitude, speed } = pos.coords;
        this.currentSpeed.set(speed ? speed * 3.6 : 0);
        if (!this.userMarker) this.userMarker = L.marker([latitude, longitude]).addTo(this.map);
        else this.userMarker.setLatLng([latitude, longitude]);
        this.map.setView([latitude, longitude], 17); 
        this.processNavigation(latitude, longitude);
      }, null, { enableHighAccuracy: true });
    }
  }

  private processNavigation(uLat: number, uLng: number) {
    if (!this.railwayData.length) return;
    const target = this.railwayData[this.currentIndex];
    const dist = this.calculateMeters(uLat, uLng, target["Converted Latitude (in degree decimal)"], target["Converted Longitude (in degree decimal)"]);

    if (dist <= 300 && dist > 60 && !this.proximityAnnounced) {
      this.speak(`Next target ${target.Event} is 300 meters away`);
      this.proximityAnnounced = true;
    }

    if (dist <= 60 && this.lastAnnouncedId !== target['Sr. No.']) {
      this.speak(`Arrived at ${target.Event}`);
      this.lastAnnouncedId = target['Sr. No.'];
      setTimeout(() => {
        if (this.currentIndex < this.railwayData.length - 1) {
          this.currentIndex++;
          this.proximityAnnounced = false;
        }
      }, 3000);
    }

    if (dist > 300) {
      let minD = Infinity;
      let closestIdx = this.currentIndex;
      this.railwayData.forEach((p, i) => {
        const d = this.calculateMeters(uLat, uLng, p["Converted Latitude (in degree decimal)"], p["Converted Longitude (in degree decimal)"]);
        if (d < minD) { minD = d; closestIdx = i; }
      });
      if(closestIdx !== this.currentIndex) {
        this.currentIndex = closestIdx;
        this.proximityAnnounced = false;
      }
    }

    this.nextTarget.set(this.railwayData[this.currentIndex]);
    this.distanceToTarget.set(dist);
    const el = document.getElementById('point-' + this.nextTarget()['Sr. No.']);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  private calculateMeters(lat1: number, lon1: number, lat2: number, lon2: number) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon/2) * Math.sin(dLon/2);
    return (R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))) * 1000;
  }

  toggleMute() { this.isMuted.set(!this.isMuted()); }
}