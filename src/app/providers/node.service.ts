import { Injectable, NgZone } from "@angular/core"
import { ipcRenderer } from "electron"
import { Subject } from "rxjs/Subject"
import { differenceInSeconds, differenceInHours, differenceInMinutes } from "date-fns"
import { ToastrService } from "ngx-toastr"
import { BehaviorSubject } from "rxjs";

export enum NodeStatuses {
  stopped = "Connect",
  starting = "Connecting",
  running = "Connected",
  reconnecting = "Reconnecting"
}

@Injectable()
export class NodeService {
  ipcRenderer: typeof ipcRenderer
  status: NodeStatuses = NodeStatuses.stopped
  autoReconnect
  autoReconnectSeconds
  timeConnected = "00:00:00"
  interval
  startedTime
  currentTime
  public nodeStatuses = NodeStatuses

  // Observable string sources
  private connectionsAnnouncedSource = new Subject<any>()
  private statusAnnouncedSource = new Subject<any>()
  private storageAnnouncedSource = new Subject<any>()
  private downloadSpeedAnnouncedSource = new Subject<any>()
  private downloadedAnnouncedSource = new Subject<any>()
  private uploadSpeedAnnouncedSource = new Subject<any>()
  private uploadedAnnouncedSource = new Subject<any>()
  private timeConnectedAnnouncedSource = new Subject<any>()
  private walletAnnouncedSource = new Subject<any>()
  private walletBalanceAnnouncedSource = new Subject<any>()
  private walletEthBalanceAnnouncedSource = new Subject<any>()
  private autoReconnectAnnouncedSource = new Subject<any>()
  private autoReconnectSecondsAnnouncedSource = new Subject<any>()

  // Observable string streams
  connectionsAnnounced$ = this.connectionsAnnouncedSource.asObservable()
  statusAnnounced$ = this.statusAnnouncedSource.asObservable()
  storageAnnounced$ = this.storageAnnouncedSource.asObservable()
  downloadSpeedAnnounced$ = this.downloadSpeedAnnouncedSource.asObservable()
  downloadedAnnounced$ = this.downloadedAnnouncedSource.asObservable()
  uploadSpeedAnnounced$ = this.uploadSpeedAnnouncedSource.asObservable()
  uploadedAnnounced$ = this.uploadedAnnouncedSource.asObservable()
  timeConnectedAnnounced$ = this.timeConnectedAnnouncedSource.asObservable()
  walletAnnounced$ = this.walletAnnouncedSource.asObservable()
  walletBalanceAnnounced$ = this.walletBalanceAnnouncedSource.asObservable()
  walletEthBalanceAnnounced$ = this.walletEthBalanceAnnouncedSource.asObservable()
  autoReconnectAnnounced$ = this.autoReconnectAnnouncedSource.asObservable()
  autoReconnectSecondsAnnounced$ = this.autoReconnectSecondsAnnouncedSource.asObservable()

  sslPrivateKey: string
  sslCrt: string
  sslCrtBundle: string

  private _settingsChanged = new BehaviorSubject<boolean>(false);
  public settingsChanged = this._settingsChanged.asObservable();

  private _storage = {
    total: 0,
    available: 0,
    used: 0
  }
  get storage() {
    return this._storage
  }
  set storage(value) {
    this._storage = value
  }

  public connections = 0
  public downloadSpeed = 0
  public downloaded = 0
  public uploadSpeed = 0
  public uploaded = 0

  private _storageDirectory: string
  get storageDirectory(): string {
    return this._storageDirectory
  }
  set storageDirectory(value: string) {
    this._storageDirectory = value
  }
  private _wsPort: string
  get wsPort(): string {
    return this._wsPort
  }
  set wsPort(value: string) {
    this._wsPort = value
  }

  public wallet = "loading..."
  public walletBalance = "loading..."
  public walletEthBalance = "loading..."

  constructor(
    private toastr: ToastrService,
    private zone: NgZone
  ) {
    this.announceStorage(this.storage)
    if (this.isElectron()) {
      this.ipcRenderer = window.require("electron").ipcRenderer
    }
    this.ipcRenderer.on("alertError", (sender, message) => {
      this.zone.run(() => {
        this.toastr.error(message)
      })
    })
    this.init()
  }

  isElectron = () => {
    return window && window.process && window.process.type
  }

  restart () {
    this.ipcRenderer.send("nodeStop")
    this.ipcRenderer.send("restartApp")
  }

  updateSettings (key, value) {
    if (key === "storage.dir") {
      this.storageDirectory = value
    }
    if (key === "sockets.ws.port") {
      this.wsPort = value
    }
    this.ipcRenderer.send("settingsUpdate", key, value)
  }

  enableRestart () {
    this._settingsChanged.next(true)
  }

  setWallet (value) {
    this.wallet = value
    this.ipcRenderer.send("setWallet", this.wallet)
  }

  refreshBalance () {
    this.ipcRenderer.send("refreshBalance")
  }

  init () {
    this.ipcRenderer.send("nodeInit")
    this.ipcRenderer.send("nodeStorageInfo")
    this.ipcRenderer.on("connections", (sender, connections) => {
      this.connections = connections
      this.announceConnections(connections)
    })
    this.ipcRenderer.on("wallet", (sender, wallet) => {
      this.wallet = wallet
      this.announceWallet(wallet)
    })
    this.ipcRenderer.on("walletBalance", (sender, walletBalance) => {
      this.walletBalance = walletBalance
      this.announceWalletBalance(walletBalance)
    })
    this.ipcRenderer.on("walletEthBalance", (sender, walletEthBalance) => {
      this.walletEthBalance = walletEthBalance
      this.announceWalletEthBalance(walletEthBalance)
    })
    this.ipcRenderer.on("winStorageInfo", (sender, storage) => {
      this.storage = storage
      this.announceStorage(storage)
    })
    this.ipcRenderer.on("uploaded", (sender, uploaded) => {
      this.uploaded = uploaded
      this.announceUploaded(this.uploaded)
    })
    this.ipcRenderer.on("uploadSpeed", (sender, uploadSpeed) => {
      this.uploadSpeed = uploadSpeed
      this.announceUploadSpeed(uploadSpeed)
    })
    this.ipcRenderer.on("timeConnected", (sender, timeConnected) => {
      this.updateTimeConnected(timeConnected)
    })
    this.ipcRenderer.on("downloaded", (sender, downloaded) => {
      this.downloaded = downloaded
      this.announceDownloaded(this.downloaded)
    })
    this.ipcRenderer.on("downloadSpeed", (sender, downloadSpeed) => {
      this.downloadSpeed = downloadSpeed
      this.announceDownloadSpeed(downloadSpeed)
    })
    this.ipcRenderer.on("settings", (sender, settings) => {
      this.wsPort = settings["sockets.ws.port"]
      this.storageDirectory = settings["storage.dir"]
      this.sslPrivateKey = settings["ssl.privateKeyPath"]
      this.sslCrt = settings["ssl.crtPath"]
      this.sslCrtBundle = settings["ssl.crtBundlePath"]
    })
    this.ipcRenderer.on("nodeStatus", (sender, status, seconds) => {
      if (status === "running") {
        this.announceStatus(NodeStatuses.running)
      } else if (status === "reconnecting") {
        this.announceStatus(NodeStatuses.reconnecting)
        this.announceAutoReconnectSeconds(seconds)
      } else if (status === "starting") {
        this.announceStatus(NodeStatuses.starting)
      } else if (status === "stopped") {
        this.announceDownloadSpeed(0)
        this.announceUploadSpeed(0)
        this.announceStatus(NodeStatuses.stopped)
      }
    })
    this.ipcRenderer.on("autoReconnect", (sender, autoReconnect) => {
      this.announceAutoReconnect(autoReconnect)
    })
  }

  setAutoReconnect(autoReconnect: boolean) {
    this.autoReconnect = autoReconnect
    this.ipcRenderer.send("setAutoReconnect", autoReconnect)
  }

  start () {
    this.ipcRenderer.send("nodeStart")
    // this.ipcRenderer.send("nodeMasterConnect")
  }

  // masterConnect () {
  //   this.ipcRenderer.send("nodeMasterConnect")
  // }

  storageInfo () {
    this.ipcRenderer.send("nodeStorageInfo")
  }

  stop () {
    this.ipcRenderer.send("nodeStop")
  }

  updateTimeConnected(timeInSeconds) {
    const seconds = (Math.floor(timeInSeconds % 3600 % 60)).toString()
    const minutes = (Math.floor(timeInSeconds % 3600 / 60)).toString()
    const hours = (Math.floor(timeInSeconds / 3600)).toString()
    const secondsString = seconds.length === 1 ? `0${seconds}` : seconds
    const minutesString = minutes.length === 1 ? `0${minutes}` : minutes
    const hoursString = hours.length === 1 ? `0${hours}` : hours
    this.announceTimeConnected(`${hoursString}:${minutesString}:${secondsString}`)
  }

  announceConnections(connections: number) {
    this.connections = connections
    this.connectionsAnnouncedSource.next(connections)
  }
  announceWallet(wallet: string) {
    this.wallet = wallet
    this.walletAnnouncedSource.next(wallet)
  }
  announceWalletBalance(walletBalance: string) {
    this.walletBalance = walletBalance
    this.walletBalanceAnnouncedSource.next(walletBalance)
  }
  announceWalletEthBalance(walletEthBalance: string) {
    this.walletEthBalance = walletEthBalance
    this.walletEthBalanceAnnouncedSource.next(walletEthBalance)
  }
  announceStatus(status: NodeStatuses, seconds?: number) {
    this.status = status
    this.statusAnnouncedSource.next(status)
  }
  announceAutoReconnectSeconds(seconds: number) {
    this.autoReconnectSeconds = seconds
    this.autoReconnectSecondsAnnouncedSource.next(seconds)
  }
  announceTimeConnected(timeConnected: string) {
    this.timeConnected = timeConnected
    this.timeConnectedAnnouncedSource.next(timeConnected)
  }
  announceStorage(storage: any) {
    this.storageAnnouncedSource.next(storage)
  }
  announceDownloadSpeed(downloadSpeed: any) {
    this.downloadSpeedAnnouncedSource.next(downloadSpeed)
  }
  announceDownloaded(downloaded: any) {
    this.downloadedAnnouncedSource.next(downloaded)
  }
  announceUploaded(uploaded: any) {
    this.uploadedAnnouncedSource.next(uploaded)
  }
  announceUploadSpeed(uploadSpeed: any) {
    this.uploadSpeedAnnouncedSource.next(uploadSpeed)
  }
  announceAutoReconnect(autoReconnect: boolean) {
    this.autoReconnect = autoReconnect
    this.autoReconnectAnnouncedSource.next(autoReconnect)
  }
}
