//Type script - front end

//================================================================================//
//============== Snippet 1 - iSpani, filter campaigns by location ================//
//================================================================================//

export class HomePage {
  private user;
  private key;
  private bProgress;
  private inprogress: FirebaseListObservable<any>

  private options;
  private currentPos; 

  private region;
  private countryCode;
  private country;
  private province;

  private campaigns: FirebaseListObservable<any>;
  private locations;

  private Locations: Array<any> = [];
  private distanceArray: Array<any> = [];
  private spinner;
  constructor(public navCtrl: NavController, public navParams: NavParams,
    public loadingCtrl: LoadingController,private geolocation : Geolocation,
    public geocoder: NativeGeocoder,
    public geoc: Geocoder, private events: Events,
    private af: AngularFireDatabase) {
      //this gets the user from the navigator (passed from the login page)
    this.user = navParams.get('user');
    this.spinner = navParams.get('spinner');

    if(this.spinner) {
      this.loader.present();
    }
    
    let env = this; //used to maintain scope, was an issue with previous versions
    firebase.database().ref(`/in_progress/${this.user.uid}`).once('value').then(res => {
      var keys = Object.keys(res.val()); //get the keys of campaigns in progress
      if(keys.length > 0) {
        //select the latest incomplete campaign and continue with it
        firebase.database().ref(`/in_progress/${this.user.uid}/${keys[0]}`).once('value').then(obj=>{
          var companyid = obj.val().companyid;
          env.loader.dismiss();
          //update the global scope that we're changing pages
          this.events.publish('page:progress', this.user, companyid, obj.val().completed, keys[0]);
        })   
      } else {
        env.loader.dismiss();
      }
    }).catch(err => {
        env.loader.dismiss();
    })

    setTimeout(()=> {
      env.loader.dismiss();
    }, 5000)
  }

  ionViewDidEnter(){
    //get location as soon as we enter the view
    this.geolocate();
  } 

  geolocate(){
    this.options = {
        enableHighAccuracy : true
    };

    this.geolocation.getCurrentPosition(this.options).then((pos) => {
        
        this.currentPos = pos; 
        //once we get co-ordinates, we reverse geocode to find the address     
        this.getplace(pos);

    },(err : PositionError)=>{
        console.log("error : " + err.message);
    });
  }

  getplace(pos) { 
    let env = this;
    this.geocoder.reverseGeocode(pos.coords.latitude, pos.coords.longitude).then((res: NativeGeocoderReverseResult) => {
      //alert(`${res.thoroughfare}, ${res.administrativeArea}, ${res.subAdministrativeArea}, ${res.locality}, ${res.subLocality}, ${res.subThoroughfare}`)
      var location = new LatLng(pos.coords.latitude, pos.coords.longitude);
      let req: GeocoderRequest = { position: location } 
      this.geoc.geocode(req).then((result) => {
        this.region = result[1].extra.featureName;
        this.countryCode = result[1].countryCode;
        this.country = result[1].country;
        this.province = result[1].adminArea;
        //areas of operation on database are structured by province and country code
        var dbEntry = `/provinces/${this.province.replace(' ','_')}_${this.countryCode}`;
        //i.e. this would return Rondebosch, Cape Town, Langa etc if it was western_cape_za
        dbEntry = dbEntry.toLowerCase();

        env.af.list(dbEntry, { preserveSnapshot: true}) 
        .subscribe(snapshots=>{ //we subscribe to the observable and push all the locations to an array
            snapshots.forEach(snapshot => {
              env.Locations.push(snapshot.val());
            });
            //alert(env.Locations);
            var i = 0;
            for(i=0; i<this.Locations.length; i++) {
              this.distanceArray.push( //we get the distance using trig and store it in a distance array 
                this.getDistance(this.Locations[i].position.lat, this.Locations[i].position.lng, pos.coords.latitude,pos.coords.longitude, this.Locations[i].name)		
              );
            }

            var min = Math.min.apply(Math, this.distanceArray); //get the closest area
            var lid = this.distanceArray.indexOf(min)
            var locationId;
            //we then get the key (or id) of the location, that is referenced throughout the database
            if(min <= 1.8) {
              locationId = this.distanceArray.indexOf(min);
            } else {
              locationId = -1; //i.e. it won't assign any location to us
            }
            if(locationId > -1) { //find the campaigns under the area key
              env.campaigns = env.af.list(`/location_campaigns/${this.Locations[locationId].locationId}/`);
              //alert(`You are in ${this.Locations[locationId].name} | ${this.Locations[locationId].locationId}`);
            }
            else {
              //alert("Not operating in your area")
              //this would return no campaigns, the html would 
            }
        })
      });
    })
  }
degreesToRadians(degrees) {
  return degrees * Math.PI / 180;
}
getDistance(lat1, lon1, lat2, lon2, place) {
	var R = 6371*1000; // metres
	var phi1 = this.degreesToRadians(parseFloat(lat1));
	var phi2 = this.degreesToRadians(parseFloat(lat2));
	var dphi = this.degreesToRadians(parseFloat(lat2)-parseFloat(lat1));
	var dlambda = this.degreesToRadians(parseFloat(lon2)-parseFloat(lon1));
	var a = Math.sin(dphi/2) * Math.sin(dphi/2) +
			Math.cos(phi1) * Math.cos(phi2) *
			Math.sin(dlambda/2) * Math.sin(dlambda/2);
	var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

	var d = (R * c)/1000;
	return d;
	
}

  private loader = this.loadingCtrl.create({
      content: "Checking jobs..."
  });

  view(key, campaign) {
    //go to the next page with and send navigation parameters
    this.navCtrl.push(JobviewPage, {key: key, campaign: campaign, user: this.user});
  }

}

//================================================================================//
//============ AGM MAPS - custom (pathChanged) emitter for polygons ==============//
//================================================================================//

/* HTML Shows one Google Map with multiple markers, each with a info window. User can add multiple polygons to map and save them to the backend
The issue with the Angular Google Maps plugin was that it didn't emit any changes to an adjusted polygon

The goal of the customization was to add an eventEmitter that would reflect these changes and allow for the HTML (Angular) code below

<agm-map class="rbg" [latitude]="location.lat" [longitude]="location.lng" [zoom]="16">
    <agm-marker [latitude]="location.lat" [longitude]="location.lng" >
    <agm-snazzy-info-window [maxWidth]="200" isOpen [closeWhenOthersOpen]="true" wrapperClass="custom-window" closeButtonMarkup='<button type="button" class="custom-close">&#215;</button>'>
        <ng-template>
        <p>{{text}}</p>
        </ng-template>
    </agm-snazzy-info-window>
    </agm-marker>
    <agm-polygon *ngFor="let poly of polygons; let i = index" [polyDraggable]="polyDraggable" [editable]="editable" [paths]="poly.data"
        (pathChanged)="onPathChanged($event, poly.key, i)" fillColor="#0f75bd" strokeColor="#0f75bd" (polyMouseUp)="polyMouseUp(poly.key,i,$event)"> </agm-polygon>
</agm-map> 

*/

var AgmPolygon = (function () {
    function AgmPolygon(_polygonManager) {
        this._polygonManager;
        this.clickable = true;

        /* .... other events and emitters

        */
        this.pathChanged = new EventEmitter(); //add the pathChanged emitter
    }

    AgmPolygon.prototype.ngAfterContentInit = function () {
        if (!this._polygonAddedToManager) {
            this._init();
        }
    };
    AgmPolygon.prototype.ngOnChanges = function (changes) {
        if (!this._polygonAddedToManager) {
            this._init();
            return;
        }
        this._polygonManager.setPolygonOptions(this, this._updatePolygonOptions(changes));
        this.pathChanged.emit(this.getPolygonPath()); //add it to reflect on the polygon changes function (emit the new path)
    };
    AgmPolygon.prototype.getPolygonPath = function() {
        return this._polygonManager.getPathForPolygon(this);
    }
    AgmPolygon.prototype._init = function () {
        this._polygonManager.addPolygon(this);
        this._polygonAddedToManager = true;
        this._addEventListeners();
    };

    AgmPolygon.prototype._addEventListeners = function () {
        var _this = this;
        var handlers = [ //all the other standard handlers
            { name: 'click', handler: function (ev) { return _this.polyClick.emit(ev); } },
            { name: 'dbclick', handler: function (ev) { return _this.polyDblClick.emit(ev); } },
            { name: 'drag', handler: function (ev) { return _this.polyDrag.emit(ev); } },
            { name: 'dragend', handler: function (ev) { return _this.polyDragEnd.emit(ev); } },
            { name: 'dragstart', handler: function (ev) { return _this.polyDragStart.emit(ev); } },
            { name: 'mousedown', handler: function (ev) { return _this.polyMouseDown.emit(ev); } },
            { name: 'mousemove', handler: function (ev) { return _this.polyMouseMove.emit(ev); } },
            { name: 'mouseout', handler: function (ev) { return _this.polyMouseOut.emit(ev); } },
            { name: 'mouseover', handler: function (ev) { return _this.polyMouseOver.emit(ev); } },
            { name: 'mouseup', handler: function (ev) { return _this.polyMouseUp.emit(ev); } },
            { name: 'rightclick', handler: function (ev) { return _this.polyRightClick.emit(ev); } },
        ];
        handlers.forEach(function (obj) {
            var os = _this._polygonManager.createEventObservable(obj.name, _this).subscribe(obj.handler);
            _this._subscriptions.push(os);
        });
        //emit the pathChanged event on every mouseup event (via subscription to an observable)
        var os = _this._polygonManager.createEventObservable('mouseup', this).subscribe((ev) => this.pathChanged.emit(this.getPolygonPath()));
        this._subscriptions.push(os);
    };
    AgmPolygon.prototype._updatePolygonOptions = function (changes) {
        return Object.keys(changes)
            .filter(function (k) { return AgmPolygon._polygonOptionsAttributes.indexOf(k) !== -1; })
            .reduce(function (obj, k) {
            obj[k] = changes[k].currentValue;
            return obj;
        }, {});
    };
    /** @internal */
    AgmPolygon.prototype.id = function () { return this._id; };
    /** @internal */
    AgmPolygon.prototype.ngOnDestroy = function () {
        this._polygonManager.deletePolygon(this);
        this.pathChanged.emit(this.getPolygonPath()); //emit the destroyed polygon
        // unsubscribe all registered observable subscriptions
        this._subscriptions.forEach(function (s) { return s.unsubscribe(); });
    };
    return AgmPolygon;
})