/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    // El build FALLA si hay errores de tipos, a propósito.
    //
    // Estuvo en `true` mucho tiempo y costó caro: un import que faltaba
    // (`callGemini`) compiló sin quejarse, se deployó, y el bot contestó "tengo
    // problemas internos" a los clientes hasta que apareció en los logs. Con esto
    // en false, ese error no habría llegado a producción.
    //
    // Si un deploy falla por tipos: corré `npx tsc --noEmit` para ver la lista.
    ignoreBuildErrors: false,
  },
  images: {
    unoptimized: true,
  },
}

export default nextConfig
