import { Demo } from "@/app/components/homePage/Demo";
import { Faq } from "@/app/components/homePage/Faq";
import { Features } from "@/app/components/homePage/Features";
import { FinalCta } from "@/app/components/homePage/FinalCta";
import { Footer } from "@/app/components/homePage/Footer";
import { Hero } from "@/app/components/homePage/Hero";
import { HowItWorks } from "@/app/components/homePage/HowItWorks";
import { Nav } from "@/app/components/homePage/Nav";
import { Security } from "@/app/components/homePage/Security";
import { UseCases } from "@/app/components/homePage/UseCases";

const page = () => {
  return (
    <main className="flex flex-col">
      <Nav />
      <Hero />
      <HowItWorks />
      <Demo />
      <Features />
      <Security />
      <UseCases />
      <Faq />
      <FinalCta />
      <Footer />
    </main>
  );
};

export default page;
