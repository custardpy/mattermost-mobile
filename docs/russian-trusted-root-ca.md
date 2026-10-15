# Bundled Russian Trusted Root CA (app-scoped trust anchor)

This fork builds an Android Mattermost client that connects to `mm.almaz-rpe.ru`
without requiring the Russian Trusted Root CA to be installed as a system or
user certificate on the device. The CA is bundled inside the APK and trusted
app-scoped.

## Background

The server `mm.almaz-rpe.ru` uses a certificate chain that terminates in the
self-signed **Russian Trusted Root CA**, which is not part of the Android system
CA store:

```
leaf  CN=almaz-rpe.ru (O=АО НПП АЛМАЗ)
  -> Russian Trusted Sub CA
    -> Russian Trusted Root CA (self-signed)
```

Root CA:

| Field | Value |
| --- | --- |
| Subject | `C=RU, O=The Ministry of Digital Development and Communications, CN=Russian Trusted Root CA` |
| Validity | 2022-03-01 -> 2032-02-27 |
| SHA-256 fingerprint | `D2:6D:2D:02:31:B7:C3:9F:92:CC:73:85:12:BA:54:10:35:19:E4:40:5D:68:B5:BD:70:3E:97:88:CA:8E:CF:31` |

Without the anchor the app fails the TLS handshake and shows:

> The certificate for this server is invalid. You might be connecting to a
> server that is pretending to be "mm.almaz-rpe.ru" which could put your
> confidential information at risk.

(`SERVER_CERTIFICATE_INVALID = -299` in `app/managers/network_manager.ts`.)

## Why a Network Security Config alone is not enough

The app performs all API traffic through
[`@mattermost/react-native-network-client`](https://github.com/mattermost/react-native-network-client).
That library builds its **own** `X509TrustManager` from `AndroidCAStore` and
installs it on a private `SSLContext` (`TrustManagerHelper.buildTrustManager()`),
so it bypasses the app's `network_security_config.xml` trust anchors. Adding the
CA to the NSC (or as a user/server certificate) has no effect on this stack.

The library also ships an assets-based certificate loader, but it only feeds
`CertificatePinner` (pinning), which still requires a chain that is already
trusted — so it cannot rescue the handshake either.

## Solution

Three pieces work together:

### 1. Bundled CA files

The same PEM is shipped twice, for two different consumers:

- `android/app/src/main/res/raw/russian_trusted_root_ca.pem` — referenced by the
  Network Security Config (covers the platform/default network stack, e.g.
  WebView, and anything not using the network-client library).
- `android/app/src/main/assets/trusted-cas/russian_trusted_root_ca.pem` — read by
  the patched library trust manager (see below).

The resource path is shortened by AGP in the APK (the file is packaged as
`res/_E.pem`), but the resource **name** `russian_trusted_root_ca` is preserved,
which is why the `assets/` copy is used for the library: assets are unaffected by
resource path shortening.

### 2. Network Security Config

`android/app/src/main/res/xml/network_security_config.xml`, wired up in
`android/app/src/main/AndroidManifest.xml`
(`android:networkSecurityConfig="@xml/network_security_config"`):

```xml
<network-security-config>
    <base-config cleartextTrafficPermitted="true">
        <trust-anchors>
            <certificates src="system" />
            <certificates src="user" />
            <certificates src="@raw/russian_trusted_root_ca" />
        </trust-anchors>
    </base-config>
</network-security-config>
```

### 3. Library patch (the actual fix)

`patches/@mattermost+react-native-network-client+1.11.4.patch` (applied by
`patch-package` during `ci/prepare-node-deps`). It changes:

- `helpers/TrustManagerHelper.kt`
  - `buildTrustManager(context: Context? = null)` now also loads every
    certificate under `assets/trusted-cas` and returns a `CompositeTrustManager`
    (system/user `AndroidCAStore` manager **or** the bundled-anchor manager).
  - Adds `buildBundledTrustManager(context)` and the `CompositeTrustManager`
    class.
- `NetworkClient.kt`
  - passes `context` into `buildTrustManager(context)` at the `buildSslConfig()`
    call site.

With this, a chain that validates against the bundled root is accepted, while
normal public-CA verification is unchanged.

## Files added or changed

| Path | Purpose |
| --- | --- |
| `android/app/src/main/res/raw/russian_trusted_root_ca.pem` | CA for the NSC |
| `android/app/src/main/assets/trusted-cas/russian_trusted_root_ca.pem` | CA for the patched library |
| `android/app/src/main/res/xml/network_security_config.xml` | trust anchor for the default stack |
| `android/app/src/main/AndroidManifest.xml` | references the NSC |
| `patches/@mattermost+react-native-network-client+1.11.4.patch` | native trust-manager patch |
| `.gitignore` | un-ignores the bundled CA (`android/app/src/main/res/raw/*` is ignored except the CA) |
| `.github/workflows/build-android-universal.yml` | build, verify, and publish the APK |

## Build and release

Workflow: `.github/workflows/build-android-universal.yml`
(`build-android-universal`).

- Triggers: push to `main` touching `android/app/src/main/res/raw/**`,
  `android/app/src/main/assets/trusted-cas/**`, `.../xml/network_security_config.xml`,
  `patches/**`, or the workflow itself; plus manual `workflow_dispatch`.
- Builds the universal APK (armv7 + arm64) with:
  `./gradlew :app:assembleRelease --no-daemon -PseparateApk=true -PuniversalApk=true -PreactNativeArchitectures=armeabi-v7a,arm64-v8a`
- Verifies the bundle before publishing:
  - the patched Kotlin (`buildBundledTrustManager`, `CompositeTrustManager`) is
    present in `node_modules` after `patch-package`;
  - `assets/trusted-cas/russian_trusted_root_ca.pem` is in the APK;
  - the CA fingerprint matches the expected SHA-256;
  - `trusted-cas`, `buildBundledTrustManager`, `CompositeTrustManager` are in the
    compiled DEX.
- Then publishes a release automatically.

### Release tagging

`ci/compute-release-tag` uses the `tag` input if provided (manual dispatch),
otherwise derives `patched-v<major>.<minor>.<N>` from `versionName` in
`android/app/build.gradle` (e.g. `2.45.0` -> `patched-v2.45.N`), where `N` is the
highest existing `patched-v<major>.<minor>.N` tag plus one. The release attaches:

- `app-universal-release.apk`
- `app-armeabi-v7a-release.apk`
- `app-arm64-v8a-release.apk`

Publishing uses the built-in `github.token`; the workflow sets
`permissions: contents: write`.

### Signing

Release builds are signed with the **debug keystore** (`android/app/debug.keystore`,
which is checked in), so all builds in this fork share one signature and upgrade
in place. To sign with a real release key, provide `MATTERMOST_RELEASE_STORE_FILE`,
`MATTERMOST_RELEASE_KEY_ALIAS`, and `MATTERMOST_RELEASE_PASSWORD` (already
supported by `android/app/build.gradle`); switching keys requires a one-time
uninstall because the signature changes.

## Verifying a downloaded APK

```bash
python3 - <<'PY'
import zipfile
z = zipfile.ZipFile('app-universal-release.apk')
assert 'assets/trusted-cas/russian_trusted_root_ca.pem' in z.namelist()
dex = b''.join(z.read(n) for n in z.namelist() if n.endswith('.dex'))
for t in (b'trusted-cas', b'buildBundledTrustManager', b'CompositeTrustManager'):
    assert t in dex, t
print('OK')
PY
```

## Maintenance

- **Updating the CA**: replace both PEM copies; the workflow fingerprint check
  must be updated to the new SHA-256.
- **Upgrading `react-native-network-client`**: bump the version in `package.json`
  and regenerate the patch (`npx patch-package @mattermost/react-native-network-client`
  after applying the same edits); the patch filename embeds the version. Re-check
  whether upstream has added a first-class "additional trust anchors" option, in
  which case the patch can be dropped.
- **Pinned-library note**: the patch targets `1.11.4`; the file/`patches/` name
  must match the installed version or `patch-package` will not apply it.
