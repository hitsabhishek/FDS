import { Component, signal, OnInit } from '@angular/core';
import { DecimalPipe } from '@angular/common';
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
 public railwayData: any[] = [];
  public nextTarget = signal<any>(null);
  public distanceToTarget = signal<number>(0);
  public statusMessage = signal<string>('Ready to Start');
  public trackingStarted = signal<boolean>(false);

  private map!: L.Map;
  private userMarker!: L.Marker;

  async ngOnInit() {
    try {
      const res = await fetch('/csvjson.json');
      this.railwayData = await res.json();
      this.initMap();
    } catch (e) {
      this.statusMessage.set('JSON Data Missing!');
    }
  }

  private initMap() {
    // Default view: Dhanbad (Project Start)
    this.map = L.map('map', { zoomControl: false }).setView([23.7927, 86.4265], 15);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(this.map);
  }

  // User Gesture Function (Fixes Permission Error)
  public startNavigation() {
    this.trackingStarted.set(true);
    this.statusMessage.set('Searching GPS...');
    this.trackUser();
  }

  private trackUser() {
    if (navigator.geolocation) {
      navigator.geolocation.watchPosition((pos) => {
        const { latitude, longitude } = pos.coords;

        if (!this.userMarker) {
          this.userMarker = L.marker([latitude, longitude]).addTo(this.map)
            .bindPopup('Current Position').openPopup();
        } else {
          this.userMarker.setLatLng([latitude, longitude]);
        }
        this.map.panTo([latitude, longitude]);
        this.processNavigation(latitude, longitude);
      }, 
      (err) => this.statusMessage.set('GPS Denied!'), 
      { enableHighAccuracy: true });
    }
  }

  private processNavigation(uLat: number, uLng: number) {
    let minD = Infinity;
    let closest: any = null;

    this.railwayData.forEach(p => {
      const d = this.calculateKM(uLat, uLng, 
                p["Converted Latitude (in degree decimal)"], 
                p["Converted Longitude (in degree decimal)"]);
      if (d < minD) {
        minD = d;
        closest = p;
      }
    });

    if (closest) {
      const meters = minD * 1000;
      this.nextTarget.set(closest);
      this.distanceToTarget.set(meters);
      this.statusMessage.set(meters > 500 ? 'FOLLOW ROUTE' : 'APPROACHING SIGNAL');

      const element = document.getElementById('point-' + closest['Sr. No.']);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }

  private calculateKM(lat1: number, lon1: number, lat2: number, lon2: number) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon/2) * Math.sin(dLon/2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }
}