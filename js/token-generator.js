/**
 * Adobe IMS Token Generator
 * JWT 토큰 생성 및 Access Token 교환 모듈
 */

class AdobeTokenGenerator {
    constructor() {
        this.imsEndpoint = 'https://ims-na1.adobelogin.com';
    }

    /**
     * Generate JWT Token
     * @param {object} credentials - Service account credentials
     */
    async generateJWT(credentials) {
        const {
            clientId,
            technicalAccountId,
            imsOrg,
            privateKey,
            metascopes = 'ent_aem_cloud_api',
            imsEndpoint = 'ims-na1.adobelogin.com'
        } = credentials;

        // JWT Header
        const header = {
            alg: 'RS256',
            typ: 'JWT'
        };

        // JWT Payload
        const now = Math.floor(Date.now() / 1000);
        const expiration = now + (24 * 60 * 60); // 24 hours

        const payload = {
            exp: expiration,
            iss: imsOrg,
            sub: technicalAccountId,
            aud: `https://${imsEndpoint}/c/${clientId}`
        };

        // Add metascopes
        const scopesList = metascopes.split(',').map(s => s.trim());
        scopesList.forEach(scope => {
            payload[`https://${imsEndpoint}/s/${scope}`] = true;
        });

        // Sign JWT
        const jwt = await this.signJWT(header, payload, privateKey);
        return jwt;
    }

    /**
     * Sign JWT with RSA private key
     */
    async signJWT(header, payload, privateKeyPem) {
        // Encode header and payload
        const encodedHeader = this.base64UrlEncode(JSON.stringify(header));
        const encodedPayload = this.base64UrlEncode(JSON.stringify(payload));
        const signingInput = `${encodedHeader}.${encodedPayload}`;

        // Import private key
        const privateKey = await this.importPrivateKey(privateKeyPem);

        // Sign
        const signature = await crypto.subtle.sign(
            { name: 'RSASSA-PKCS1-v1_5' },
            privateKey,
            new TextEncoder().encode(signingInput)
        );

        const encodedSignature = this.base64UrlEncode(signature);

        return `${signingInput}.${encodedSignature}`;
    }

    /**
     * Import PEM private key
     */
    async importPrivateKey(pem) {
        // Normalize line endings and remove PEM headers
        let pemContents = pem
            .replace(/\\r\\n/g, '\n')  // Handle escaped \r\n
            .replace(/\\n/g, '\n')      // Handle escaped \n
            .replace(/\r\n/g, '\n')     // Handle Windows line endings
            .replace(/\r/g, '\n')       // Handle old Mac line endings
            .replace(/-----BEGIN RSA PRIVATE KEY-----/g, '')
            .replace(/-----END RSA PRIVATE KEY-----/g, '')
            .replace(/-----BEGIN PRIVATE KEY-----/g, '')
            .replace(/-----END PRIVATE KEY-----/g, '')
            .replace(/\s+/g, '');       // Remove all whitespace including newlines

        // Validate base64 string
        if (!/^[A-Za-z0-9+/]*={0,2}$/.test(pemContents)) {
            throw new Error('Invalid PEM format: contains invalid characters');
        }

        // Decode base64
        let binaryString;
        try {
            binaryString = atob(pemContents);
        } catch (e) {
            throw new Error('Invalid PEM format: base64 decoding failed. Please check the private key format.');
        }

        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }

        // Try PKCS#8 format first, then PKCS#1
        try {
            return await crypto.subtle.importKey(
                'pkcs8',
                bytes.buffer,
                { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
                false,
                ['sign']
            );
        } catch (e) {
            // Convert PKCS#1 to PKCS#8
            try {
                const pkcs8 = this.convertPKCS1ToPKCS8(bytes);
                return await crypto.subtle.importKey(
                    'pkcs8',
                    pkcs8,
                    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
                    false,
                    ['sign']
                );
            } catch (e2) {
                throw new Error('Failed to import private key. Ensure it is a valid RSA private key in PEM format.');
            }
        }
    }

    /**
     * Convert PKCS#1 to PKCS#8 format
     */
    convertPKCS1ToPKCS8(pkcs1Bytes) {
        // PKCS#8 header for RSA
        const pkcs8Header = new Uint8Array([
            0x30, 0x82, 0x00, 0x00, // SEQUENCE (length placeholder)
            0x02, 0x01, 0x00,       // INTEGER 0
            0x30, 0x0d,             // SEQUENCE
            0x06, 0x09,             // OID
            0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01, // rsaEncryption OID
            0x05, 0x00,             // NULL
            0x04, 0x82, 0x00, 0x00  // OCTET STRING (length placeholder)
        ]);

        // Calculate lengths
        const pkcs1Length = pkcs1Bytes.length;
        const totalLength = pkcs8Header.length + pkcs1Length - 4;

        // Create PKCS#8 buffer
        const pkcs8 = new Uint8Array(totalLength + 4);
        pkcs8.set(pkcs8Header);
        pkcs8.set(pkcs1Bytes, pkcs8Header.length);

        // Update lengths
        pkcs8[2] = ((totalLength >> 8) & 0xff);
        pkcs8[3] = (totalLength & 0xff);
        pkcs8[pkcs8Header.length - 2] = ((pkcs1Length >> 8) & 0xff);
        pkcs8[pkcs8Header.length - 1] = (pkcs1Length & 0xff);

        return pkcs8.buffer;
    }

    /**
     * Base64 URL encode
     */
    base64UrlEncode(data) {
        let base64;
        if (typeof data === 'string') {
            base64 = btoa(unescape(encodeURIComponent(data)));
        } else {
            // ArrayBuffer
            const bytes = new Uint8Array(data);
            let binary = '';
            for (let i = 0; i < bytes.length; i++) {
                binary += String.fromCharCode(bytes[i]);
            }
            base64 = btoa(binary);
        }
        return base64
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/, '');
    }

    /**
     * Exchange JWT for Access Token
     * @param {object} credentials - Credentials including JWT
     */
    async exchangeJWTForToken(credentials) {
        const {
            clientId,
            clientSecret,
            jwt,
            imsEndpoint = 'ims-na1.adobelogin.com'
        } = credentials;

        // Use local proxy to avoid CORS
        const url = '/ims/exchange/jwt';

        const formData = new URLSearchParams();
        formData.append('client_id', clientId);
        formData.append('client_secret', clientSecret);
        formData.append('jwt_token', jwt);
        formData.append('ims_endpoint', imsEndpoint);

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                body: formData
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Token exchange failed: ${response.status} - ${errorText}`);
            }

            const data = await response.json();

            if (data.error) {
                throw new Error(`${data.error}: ${data.error_description || ''}`);
            }

            return {
                accessToken: data.access_token,
                tokenType: data.token_type,
                expiresIn: data.expires_in
            };
        } catch (error) {
            throw new Error(`Token exchange failed: ${error.message}`);
        }
    }

    /**
     * Generate Access Token (full flow)
     * @param {object} credentials - Full credentials
     */
    async generateAccessToken(credentials) {
        const {
            clientId,
            clientSecret,
            technicalAccountId,
            imsOrg,
            privateKey,
            metascopes,
            imsEndpoint
        } = credentials;

        // Step 1: Generate JWT
        const jwt = await this.generateJWT({
            clientId,
            technicalAccountId,
            imsOrg,
            privateKey,
            metascopes,
            imsEndpoint
        });

        // Step 2: Exchange JWT for Access Token
        const tokenResponse = await this.exchangeJWTForToken({
            clientId,
            clientSecret,
            jwt,
            imsEndpoint
        });

        return {
            jwt,
            ...tokenResponse,
            generatedAt: new Date().toISOString()
        };
    }

    /**
     * Decode JWT Token (without verification)
     */
    decodeJWT(token) {
        try {
            const parts = token.split('.');
            if (parts.length !== 3) {
                throw new Error('Invalid JWT format');
            }

            const header = JSON.parse(atob(parts[0].replace(/-/g, '+').replace(/_/g, '/')));
            const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));

            return { header, payload };
        } catch (e) {
            throw new Error('Failed to decode JWT: ' + e.message);
        }
    }

    /**
     * Check if token is expired
     */
    isTokenExpired(token) {
        try {
            const { payload } = this.decodeJWT(token);
            const exp = payload.exp * 1000; // Convert to milliseconds
            return Date.now() >= exp;
        } catch (e) {
            return true;
        }
    }

    /**
     * Get token expiration date
     */
    getTokenExpiration(token) {
        try {
            const { payload } = this.decodeJWT(token);
            return new Date(payload.exp * 1000);
        } catch (e) {
            return null;
        }
    }
}

// Export
window.AdobeTokenGenerator = AdobeTokenGenerator;
