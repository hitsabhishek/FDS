import { Component, signal, effect, OnInit } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { DecimalPipe } from '@angular/common'; // Distance format karne ke liye
import * as L from 'leaflet';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, DecimalPipe],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App implements OnInit {
  // Signals for Reactive UI
  nextTarget = signal<any>(null);
  distanceToTarget = signal<number>(0);
  statusMessage = signal<string>('Initializing GPS...');
  
  private map!: L.Map;
  private userMarker!: L.Marker;
  private railwayData: any[] = [];

  async ngOnInit() {
    // 1. Load JSON Data (Public folder se)
    try {
      const res = await fetch('/csvjson.json');
      this.railwayData = await res.json();
      
      this.initMap();
      this.trackUser();
    } catch (e) {
      this.statusMessage.set('Error loading JSON data');
    }
  }

  private initMap() {
    // Default view (Dhanbad Station)
    this.map = L.map('map', { zoomControl: false }).setView([23.7927, 86.4265], 15);
    
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19
    }).addTo(this.map);
  }

  private trackUser() {
    if (!navigator.geolocation) {
      this.statusMessage.set('GPS not supported');
      return;
    }

    navigator.geolocation.watchPosition((pos) => {
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;

      // Update Marker
      if (!this.userMarker) {
        this.userMarker = L.marker([lat, lng]).addTo(this.map);
      } else {
        this.userMarker.setLatLng([lat, lng]);
      }
      this.map.panTo([lat, lng]);

      this.findNearest(lat, lng);
    }, 
    (err) => this.statusMessage.set('Location Access Denied'),
    { enableHighAccuracy: true });
  }

  private findNearest(uLat: number, uLng: number) {
    let minD = Infinity;
    let closest = null;

    this.railwayData.forEach(p => {
      const d = this.calculateKM(uLat, uLng, 
                p["Converted Latitude (in degree decimal)"], 
                p["Converted Longitude (in degree decimal)"]);
      if (d < minD) {
        minD = d;
        closest = p;
      }
    });

    const meters = minD * 1000;
    this.nextTarget.set(closest);
    this.distanceToTarget.set(meters);

    if (meters > 500) {
      this.statusMessage.set('FOLLOW ROUTE: Target is far');
    } else {
      this.statusMessage.set('APPROACHING: Target within 500m');
    }
  }

  private calculateKM(lat1:any, lon1:any, lat2:any, lon2:any) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon/2) * Math.sin(dLon/2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }
}