// ================= MOBILE MENU =================

const menuBtn = document.getElementById("menuBtn");
const navMenu = document.getElementById("navMenu");

menuBtn.addEventListener("click", () => {
    navMenu.classList.toggle("active");

    const icon = menuBtn.querySelector("i");

    if (navMenu.classList.contains("active")) {
        icon.classList.remove("fa-bars");
        icon.classList.add("fa-xmark");
    } else {
        icon.classList.remove("fa-xmark");
        icon.classList.add("fa-bars");
    }
});


// ================= CLOSE MENU AFTER CLICK =================

const navLinks = document.querySelectorAll("#navMenu a");

navLinks.forEach(link => {

    link.addEventListener("click", () => {

        navMenu.classList.remove("active");

        const icon = menuBtn.querySelector("i");

        icon.classList.remove("fa-xmark");
        icon.classList.add("fa-bars");

    });

});


// ================= CONTACT FORM =================

const contactForm = document.querySelector(".contact-form form");

contactForm.addEventListener("submit", function(event) {

    event.preventDefault();

    alert("धन्यवाद! आपला संदेश प्राप्त झाला आहे. गणपती बाप्पा मोरया! 🙏");

    contactForm.reset();

});