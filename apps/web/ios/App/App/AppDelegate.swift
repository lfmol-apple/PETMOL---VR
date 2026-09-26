import UIKit
import Capacitor
import AppTrackingTransparency
import FacebookCore

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // Meta (Facebook) SDK: inicializa na abertura (campanhas de instalação do Meta Ads, iOS 14+).
        // Os IDs vêm do Info.plist (FacebookAppID / FacebookClientToken).
        ApplicationDelegate.shared.application(application, didFinishLaunchingWithOptions: launchOptions)
        return true
    }

    func applicationWillResignActive(_ application: UIApplication) {
        // Sent when the application is about to move from active to inactive state. This can occur for certain types of temporary interruptions (such as an incoming phone call or SMS message) or when the user quits the application and it begins the transition to the background state.
        // Use this method to pause ongoing tasks, disable timers, and invalidate graphics rendering callbacks. Games should use this method to pause the game.
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
        // Use this method to release shared resources, save user data, invalidate timers, and store enough application state information to restore your application to its current state in case it is terminated later.
        // If your application supports background execution, this method is called instead of applicationWillTerminate: when the user quits.
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
        // Called as part of the transition from the background to the active state; here you can undo many of the changes made on entering the background.
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        // Restart any tasks that were paused (or not yet started) while the application was inactive. If the application was previously in the background, optionally refresh the user interface.
        requestTrackingAndActivateMeta()
    }

    func applicationWillTerminate(_ application: UIApplication) {
        // Called when the application is about to terminate. Save data if appropriate. See also applicationDidEnterBackground:.
    }

    // MARK: - Meta SDK + App Tracking Transparency
    // O pedido de rastreamento da Apple só funciona com o app ATIVO, por isso vive aqui e não no
    // didFinishLaunching. Na 1ª abertura mostra o aviso; depois só devolve o status já decidido.
    // Se outro aviso do sistema estiver na tela e o pedido não for exibido (status segue
    // "não determinado"), a próxima vez que o app ficar ativo tenta de novo.

    private var isRequestingTracking = false

    private func requestTrackingAndActivateMeta() {
        guard !isRequestingTracking else { return }
        isRequestingTracking = true
        // Pequeno atraso: a Apple ignora o pedido se feito durante a transição de abertura.
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.6) { [weak self] in
            ATTrackingManager.requestTrackingAuthorization { status in
                DispatchQueue.main.async {
                    self?.isRequestingTracking = false
                    // iOS 17+: o SDK já lê o status do ATT sozinho. Antes disso, repassa manualmente.
                    if #unavailable(iOS 17.0) {
                        Settings.shared.isAdvertiserTrackingEnabled = (status == .authorized)
                    }
                    // Registra a ativação (instalação/abertura) já com o status do ATT decidido.
                    AppEvents.shared.activateApp()
                }
            }
        }
    }

    // MARK: - Push Notifications (APNs)
    // O plugin @capacitor/push-notifications espera que o AppDelegate encaminhe
    // o resultado do registro no APNs via NotificationCenter — sem isto, o
    // evento `registration` do JS nunca dispara e o device token some.

    func application(_ application: UIApplication,
                     didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        NotificationCenter.default.post(name: .capacitorDidRegisterForRemoteNotifications,
                                       object: deviceToken)
    }

    func application(_ application: UIApplication,
                     didFailToRegisterForRemoteNotificationsWithError error: Error) {
        NotificationCenter.default.post(name: .capacitorDidFailToRegisterForRemoteNotifications,
                                       object: error)
    }

    func application(_ application: UIApplication,
                     configurationForConnecting connectingSceneSession: UISceneSession,
                     options: UIScene.ConnectionOptions) -> UISceneConfiguration {
        let config = UISceneConfiguration(name: "Default Configuration",
                                          sessionRole: connectingSceneSession.role)
        config.delegateClass = SceneDelegate.self
        return config
    }
}
