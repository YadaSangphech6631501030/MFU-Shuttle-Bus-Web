import Flutter
import GoogleMaps
import UIKit


@main
@objc class AppDelegate: FlutterAppDelegate {
  override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
  ) -> Bool {
    if let rawApiKey = Bundle.main.object(forInfoDictionaryKey: "GMSApiKey") as? String {
      let apiKey = rawApiKey.trimmingCharacters(in: .whitespacesAndNewlines)
      if !apiKey.isEmpty && !apiKey.hasPrefix("$(") {
        GMSServices.provideAPIKey(apiKey)
      }
    }
    GeneratedPluginRegistrant.register(with: self)
    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }
}
