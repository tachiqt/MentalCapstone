"""
Builds the SmartCare User Manual as a .docx file.

Content is derived from the shipped behaviour of the Laravel API (backend/), the
web dashboard (web/) and the Expo app (mobile-rn/) — not from intentions. Where
a capability is missing or only reachable outside the product, the manual says so
in a "Known limitation" box rather than describing a feature that does not exist.

Usage:
    pip install python-docx
    python docs/manual/build_user_manual.py

Writes: docs/manual/SmartCare-User-Manual.docx
"""

from pathlib import Path

from docx import Document
from docx.enum.section import WD_SECTION
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_BREAK
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Inches, Pt, RGBColor

# ---------------------------------------------------------------------------
# Brand
# ---------------------------------------------------------------------------

GREEN_900 = RGBColor(0x0B, 0x3D, 0x3B)
GREEN_800 = RGBColor(0x0F, 0x4C, 0x4A)
GREEN_600 = RGBColor(0x2F, 0x7D, 0x5A)
INK = RGBColor(0x1A, 0x24, 0x23)
MUTED = RGBColor(0x5B, 0x6B, 0x69)
WHITE = RGBColor(0xFF, 0xFF, 0xFF)

TINT_GREEN = "EAF4EE"
TINT_AMBER = "FDF3E2"
TINT_RED = "FBEDEB"
TINT_GREY = "F1F4F3"
HEADER_FILL = "0F4C4A"

BODY_FONT = "Aptos"
HEAD_FONT = "Aptos Display"

OUT = Path(__file__).resolve().parent / "SmartCare-User-Manual.docx"


# ---------------------------------------------------------------------------
# Low-level helpers
# ---------------------------------------------------------------------------


def shade(paragraph, hex_fill):
    """Paint a paragraph background; python-docx has no API for this."""
    ppr = paragraph._p.get_or_add_pPr()
    shd = OxmlElement("w:shd")
    shd.set(qn("w:val"), "clear")
    shd.set(qn("w:color"), "auto")
    shd.set(qn("w:fill"), hex_fill)
    ppr.append(shd)


def cell_shade(cell, hex_fill):
    tc_pr = cell._tc.get_or_add_tcPr()
    shd = OxmlElement("w:shd")
    shd.set(qn("w:val"), "clear")
    shd.set(qn("w:color"), "auto")
    shd.set(qn("w:fill"), hex_fill)
    tc_pr.append(shd)


def keep_with_next(paragraph):
    ppr = paragraph._p.get_or_add_pPr()
    el = OxmlElement("w:keepNext")
    ppr.append(el)


def field(paragraph, instruction):
    """Insert a Word field (used for TOC and page numbers)."""
    run = paragraph.add_run()
    begin = OxmlElement("w:fldChar")
    begin.set(qn("w:fldCharType"), "begin")
    instr = OxmlElement("w:instrText")
    instr.set(qn("xml:space"), "preserve")
    instr.text = instruction
    sep = OxmlElement("w:fldChar")
    sep.set(qn("w:fldCharType"), "separate")
    end = OxmlElement("w:fldChar")
    end.set(qn("w:fldCharType"), "end")
    for el in (begin, instr, sep, end):
        run._r.append(el)


# ---------------------------------------------------------------------------
# Document setup
# ---------------------------------------------------------------------------


def build_styles(doc):
    normal = doc.styles["Normal"]
    normal.font.name = BODY_FONT
    normal.font.size = Pt(10.5)
    normal.font.color.rgb = INK
    pf = normal.paragraph_format
    pf.space_after = Pt(6)
    pf.line_spacing = 1.15

    sizes = {"Title": 30, "Heading 1": 19, "Heading 2": 14, "Heading 3": 11.5, "Heading 4": 10.5}
    colours = {
        "Title": GREEN_900,
        "Heading 1": GREEN_900,
        "Heading 2": GREEN_800,
        "Heading 3": GREEN_600,
        "Heading 4": INK,
    }
    for name, size in sizes.items():
        st = doc.styles[name]
        st.font.name = HEAD_FONT if name in ("Title", "Heading 1") else BODY_FONT
        st.font.size = Pt(size)
        st.font.bold = True
        st.font.color.rgb = colours[name]
        st.paragraph_format.space_before = Pt(14 if name.startswith("Heading") else 0)
        st.paragraph_format.space_after = Pt(6)
        st.paragraph_format.keep_with_next = True


def page_footer(section, doc):
    footer = section.footer
    p = footer.paragraphs[0]
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = p.add_run("SmartCare User Manual  ·  Malvar Assisted Facility and Therapy Center  ·  Page ")
    run.font.size = Pt(8)
    run.font.color.rgb = MUTED
    field(p, "PAGE")
    for r in p.runs:
        r.font.size = Pt(8)
        r.font.color.rgb = MUTED


# ---------------------------------------------------------------------------
# Content helpers
# ---------------------------------------------------------------------------


class Manual:
    def __init__(self, doc):
        self.doc = doc

    def h1(self, text):
        self.doc.add_page_break()
        return self.doc.add_heading(text, level=1)

    def h1_nobreak(self, text):
        return self.doc.add_heading(text, level=1)

    def h2(self, text):
        return self.doc.add_heading(text, level=2)

    def h3(self, text):
        return self.doc.add_heading(text, level=3)

    def p(self, text, italic=False, bold=False):
        para = self.doc.add_paragraph()
        run = para.add_run(text)
        run.italic = italic
        run.bold = bold
        return para

    def lead(self, text):
        para = self.doc.add_paragraph()
        run = para.add_run(text)
        run.italic = True
        run.font.color.rgb = MUTED
        run.font.size = Pt(10.5)
        para.paragraph_format.space_after = Pt(10)
        return para

    def bullets(self, items):
        for it in items:
            para = self.doc.add_paragraph(style="List Bullet")
            self._rich(para, it)

    def steps(self, items):
        for it in items:
            para = self.doc.add_paragraph(style="List Number")
            self._rich(para, it)

    def _rich(self, para, text):
        """Supports **bold** and `code` inline markers."""
        import re

        for token in re.split(r"(\*\*[^*]+\*\*|`[^`]+`)", text):
            if not token:
                continue
            if token.startswith("**") and token.endswith("**"):
                run = para.add_run(token[2:-2])
                run.bold = True
            elif token.startswith("`") and token.endswith("`"):
                run = para.add_run(token[1:-1])
                run.font.name = "Consolas"
                run.font.size = Pt(9.5)
                run.font.color.rgb = GREEN_800
            else:
                para.add_run(token)

    def callout(self, kind, text):
        fills = {
            "note": TINT_GREEN,
            "warning": TINT_AMBER,
            "limitation": TINT_RED,
            "tip": TINT_GREY,
        }
        labels = {
            "note": "Note",
            "warning": "Important",
            "limitation": "Known limitation",
            "tip": "Tip",
        }
        para = self.doc.add_paragraph()
        shade(para, fills[kind])
        para.paragraph_format.space_before = Pt(8)
        para.paragraph_format.space_after = Pt(10)
        para.paragraph_format.left_indent = Inches(0.12)
        para.paragraph_format.right_indent = Inches(0.12)
        label = para.add_run(labels[kind] + "  ")
        label.bold = True
        label.font.color.rgb = GREEN_900
        label.font.size = Pt(9.5)
        self._rich(para, text)
        for run in para.runs[1:]:
            run.font.size = Pt(9.5)
        return para

    def table(self, headers, rows, widths=None):
        t = self.doc.add_table(rows=1, cols=len(headers))
        t.style = "Table Grid"
        t.alignment = WD_TABLE_ALIGNMENT.CENTER
        t.autofit = True

        hdr = t.rows[0].cells
        for i, head in enumerate(headers):
            cell_shade(hdr[i], HEADER_FILL)
            para = hdr[i].paragraphs[0]
            run = para.add_run(head)
            run.bold = True
            run.font.color.rgb = WHITE
            run.font.size = Pt(9.5)
            para.paragraph_format.space_after = Pt(2)

        for r_i, row in enumerate(rows):
            cells = t.add_row().cells
            for c_i, value in enumerate(row):
                para = cells[c_i].paragraphs[0]
                self._rich(para, str(value))
                for run in para.runs:
                    run.font.size = Pt(9.5)
                para.paragraph_format.space_after = Pt(2)
            if r_i % 2 == 1:
                for cell in cells:
                    cell_shade(cell, TINT_GREY)

        if widths:
            for row in t.rows:
                for i, w in enumerate(widths):
                    row.cells[i].width = Inches(w)

        self.doc.add_paragraph().paragraph_format.space_after = Pt(4)
        return t


# ---------------------------------------------------------------------------
# Cover, TOC
# ---------------------------------------------------------------------------


def cover(m, doc):
    for _ in range(4):
        doc.add_paragraph()

    logo = Path(__file__).resolve().parents[2] / "mobile-rn" / "assets" / "logo.png"
    if logo.exists():
        para = doc.add_paragraph()
        para.alignment = WD_ALIGN_PARAGRAPH.CENTER
        para.add_run().add_picture(str(logo), width=Inches(1.5))

    title = doc.add_paragraph()
    title.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = title.add_run("SmartCare")
    run.font.name = HEAD_FONT
    run.font.size = Pt(40)
    run.bold = True
    run.font.color.rgb = GREEN_900

    sub = doc.add_paragraph()
    sub.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = sub.add_run("User Manual and Daily Operating Guide")
    run.font.size = Pt(16)
    run.font.color.rgb = GREEN_600

    org = doc.add_paragraph()
    org.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = org.add_run("Malvar Assisted Facility and Therapy Center")
    run.font.size = Pt(11.5)
    run.font.color.rgb = MUTED

    for _ in range(2):
        doc.add_paragraph()

    box = doc.add_paragraph()
    box.alignment = WD_ALIGN_PARAGRAPH.CENTER
    shade(box, TINT_GREEN)
    run = box.add_run(
        "Covers all five roles:  Head Doctor  ·  Psychometrician  ·  Teacher  ·  Caretaker  ·  Parent"
    )
    run.font.size = Pt(10)
    run.bold = True
    run.font.color.rgb = GREEN_900

    for _ in range(6):
        doc.add_paragraph()

    note = doc.add_paragraph()
    note.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = note.add_run(
        "Confidential — contains guidance for handling children's clinical records.\n"
        "Distribute only to authorised facility staff and enrolled families."
    )
    run.font.size = Pt(9)
    run.italic = True
    run.font.color.rgb = MUTED


def toc(m, doc):
    doc.add_page_break()
    doc.add_heading("Contents", level=1)
    m.lead(
        "This table of contents is generated by Word. To fill it in, right-click anywhere "
        "in the grey field below and choose Update Field, or press F9."
    )
    para = doc.add_paragraph()
    field(para, r'TOC \o "1-2" \h \z \u')
    doc.add_paragraph()


# ---------------------------------------------------------------------------
# Sections
# ---------------------------------------------------------------------------


def how_to_use(m):
    m.h1("How to Use This Manual")
    m.lead(
        "Five people with five different jobs share SmartCare. This manual is written so each "
        "of them can read only their own chapter and still work confidently."
    )

    m.h2("Find your chapter")
    m.table(
        ["If your role is", "You work on", "Read"],
        [
            ["Head Doctor", "Web dashboard (computer browser)", "Chapter 3"],
            ["Psychometrician", "Web dashboard (computer browser)", "Chapter 4"],
            ["Teacher", "Mobile app (Android)", "Chapter 5"],
            ["Caretaker", "Mobile app (Android)", "Chapter 6"],
            ["Parent or Guardian", "Mobile app (Android)", "Chapter 7"],
        ],
        widths=[1.9, 2.9, 1.4],
    )

    m.p(
        "Everyone should read Chapter 1 (what SmartCare is and who may sign in where) and "
        "Chapter 2 (getting your account and signing in) at least once. After that, go "
        "straight to your own chapter. Chapter 8 collects reference material — test logins, "
        "the full notification list, and troubleshooting."
    )

    m.h2("How each role chapter is organised")
    m.bullets(
        [
            "**At a glance** — what the role is responsible for, in one table.",
            "**Your day, start to finish** — the realistic daily rhythm, in the order the work actually happens.",
            "**Task instructions** — numbered steps for every action available to you.",
            "**What you cannot do** — the boundaries, so you know when to ask someone else.",
            "**If something goes wrong** — the messages you may see and what to do about them.",
        ]
    )

    m.h2("Conventions used")
    m.bullets(
        [
            "**Bold** text is something you click, tap, or type.",
            "`Monospaced` text is an exact value, such as a username or a status word.",
            "Coloured boxes flag things worth pausing on: a **Note**, an **Important** warning, "
            "a **Tip**, or a **Known limitation**.",
        ]
    )

    m.callout(
        "note",
        "Every statement in this manual reflects how the system behaves today. Where a feature "
        "is genuinely missing or has to be done outside SmartCare, it is labelled as a Known "
        "limitation instead of being described as if it worked. Please treat those boxes as the "
        "honest to-do list for the next release.",
    )


def chapter_overview(m):
    m.h1("Chapter 1 — Understanding SmartCare")
    m.lead(
        "SmartCare keeps one shared record for each child so that the clinician who assesses "
        "them, the teacher who runs their sessions, the caretaker who gives their medicine, and "
        "the parent at home are all working from the same information."
    )

    m.h2("1.1  The two halves of the system")
    m.p(
        "SmartCare is one system with two front doors. Which door you use is decided by your "
        "role, and you cannot use the other one."
    )
    m.table(
        ["", "Web dashboard", "Mobile app"],
        [
            ["Who signs in", "Head Doctor, Psychometrician", "Teacher, Caretaker, Parent"],
            ["Device", "Computer browser", "Android phone or tablet"],
            [
                "Built for",
                "Clinical administration: registering children, assessments, scheduling, staff, reports",
                "Front-line daily work: giving doses, running sessions, following a child's progress",
            ],
        ],
        widths=[1.4, 2.4, 2.4],
    )

    m.callout(
        "warning",
        "The split is enforced, not advisory. A Teacher, Caretaker, or Parent who tries to sign "
        "in on the web is refused with **“This account is for the SmartCare mobile app. Teachers, "
        "caretakers, and parents cannot sign in on the web.”** A Head Doctor or Psychometrician "
        "who tries the mobile app is refused with **“This account is for the web dashboard. Use a "
        "Teacher, Caretaker, or Parent account.”** Neither is a bug — use the door for your role.",
    )

    m.h2("1.2  The five roles")
    m.table(
        ["Role", "In one sentence", "The one thing only they can do"],
        [
            [
                "Head Doctor",
                "Runs the facility: owns staff accounts, the checklist library, the therapy calendar, medication plans, and the resource library.",
                "Approve AI learning plans on the web, and create or delete staff accounts.",
            ],
            [
                "Psychometrician",
                "The assessing clinician: registers children, scores assessments, and requests AI recommendations.",
                "See the psychometrician dashboard of their own assessment workload.",
            ],
            [
                "Teacher",
                "Delivers therapy and learning: reviews AI plans, follows the session calendar, uses the resource library.",
                "Approve or reject an AI learning plan from the mobile app.",
            ],
            [
                "Caretaker",
                "Handles daily care: works the medication list and records every dose.",
                "Record a medication dose. No other role can.",
            ],
            [
                "Parent",
                "Follows their own child: progress, milestones, adherence, upcoming sessions, and sends updates home-to-team.",
                "Send a care update to the team.",
            ],
        ],
        widths=[1.15, 2.85, 2.2],
    )

    m.h2("1.3  Who can see which child")
    m.p("This single rule explains almost every “why can't I see that child?” question.")
    m.bullets(
        [
            "**Head Doctor and Psychometrician see every child** in the facility, with no filtering.",
            "**Teacher, Caretaker, and Parent see only the children assigned to them**, and only "
            "under their own relationship. A teacher linked to a child as their caretaker would "
            "not see that child on the teacher screens.",
        ]
    )
    m.p(
        "The same rule governs notifications: you are only ever told about a child you are "
        "already allowed to see. It also means an unassigned child is invisible to the entire "
        "mobile side, no matter how complete their record is."
    )

    m.callout(
        "limitation",
        "**Assigning a child to a teacher, caretaker, or parent cannot be done from the web "
        "dashboard.** The capability exists in the system and correctly notifies the person "
        "assigned, but no screen calls it. The **Caretaker name** and **Relationship** fields on "
        "the child registration form are free text saved into the child's notes — filling them in "
        "does not give that person access. Until an assignment screen is added, assignments must "
        "be made by a developer or administrator directly. Plan for this: a newly registered "
        "child will not appear for any mobile user until they are assigned.",
    )

    m.h2("1.4  How information travels")
    m.p("A typical piece of information moves through SmartCare like this:")
    m.steps(
        [
            "The **Psychometrician** scores an assessment against a checklist and submits it.",
            "They ask SmartCare to **generate an AI learning plan** from that assessment.",
            "A **Head Doctor** (on the web) or a **Teacher** (on mobile) **reviews** that plan and approves or rejects it.",
            "Approving it automatically creates an active **therapy plan** for the child.",
            "The **Head Doctor** schedules therapy sessions and sets up medication schedules.",
            "The **Caretaker** records each dose; the **Teacher** runs the sessions.",
            "The **Parent** sees the resulting milestones, adherence, and upcoming sessions, and sends updates back.",
        ]
    )
    m.p(
        "Every one of those steps notifies the people connected to that child, so nobody has to "
        "be told twice by hand."
    )


def chapter_access(m):
    m.h1("Chapter 2 — Getting Your Account and Signing In")
    m.lead("Everybody's first day follows the same three steps, whichever role you have.")

    m.h2("2.1  How accounts are created")
    m.p(
        "You do not sign yourself up. There is no public registration anywhere in SmartCare. "
        "The **Head Doctor creates every account**, chooses your role, and sets your first "
        "password. The moment your account is created, SmartCare emails you a verification link "
        "automatically — you do not have to request it."
    )

    m.h2("2.2  Verify your email before your first sign-in")
    m.steps(
        [
            "Open the email from SmartCare and click the verification link.",
            "Your browser confirms the account is active.",
            "Return to the web dashboard or the mobile app and sign in.",
        ]
    )
    m.callout(
        "warning",
        "**The verification link expires 15 minutes after it is sent.** If yours has expired, "
        "use the resend option described below — do not ask for a new account.",
    )

    m.p("Until you verify, sign-in is refused with a message naming your email address:")
    m.p(
        "“We already sent a verification link to you@example.com. Open it to activate your "
        "account, or resend it below.”",
        italic=True,
    )

    m.h3("Resending the link")
    m.bullets(
        [
            "**Mobile app** — the **Verify your email** window appears by itself on that first "
            "refused sign-in. Tap **Resend link**. On success it reads “Sent. Check your inbox, "
            "and your spam folder if it is not there.” and the button changes to **Send again**.",
            "**Web dashboard** — ask your Head Doctor to use **Resend verification email** on "
            "your account, which also gives them a link they can send you directly.",
        ]
    )
    m.callout(
        "tip",
        "Resending is limited to 5 requests per minute. If you see “Too many requests. Wait a "
        "minute before asking for another link.”, simply wait and try once more.",
    )

    m.h2("2.3  Signing in to the web dashboard")
    m.p("Web dashboard, for the Head Doctor and Psychometrician:")
    m.steps(
        [
            "Open the SmartCare web address in a browser.",
            "In **Username**, type either your username or your email address — both work.",
            "Type your **Password**. Use the eye icon to check what you typed.",
            "Click **Sign In**.",
        ]
    )
    m.p(
        "A Head Doctor lands on the **Dashboard**. A Psychometrician lands on the **Assessments** "
        "hub, because that is where their work starts."
    )

    m.h3("Continue with Google (web)")
    m.p(
        "If your facility has configured Google sign-in, a Google button appears on the login "
        "page. It signs you in to an account that already exists — it cannot create one. If you "
        "use a Google address with no SmartCare account you are told: “No SmartCare account is "
        "registered for this Google email. Ask your Head Doctor to create and verify your account "
        "first.”"
    )

    m.h2("2.4  Signing in to the mobile app")
    m.p("Mobile app, for the Teacher, Caretaker, and Parent:")
    m.steps(
        [
            "Install the SmartCare app on your Android device.",
            "The first time you open it, swipe through the three welcome screens — **Connected "
            "care**, **Follow progress**, and **Better coordination** — then tap **Get Started**. "
            "You can skip straight there with **Already have an account? Sign in**. This "
            "introduction appears only once.",
            "On **Welcome back**, fill in **Username or email** and **Password**.",
            "Tap **Sign In**.",
        ]
    )
    m.p(
        "You land straight on your role's home screen: Teachers on **Home**, Caretakers on "
        "**Today**, Parents on **Progress**."
    )

    m.h3("Continue with Google (mobile)")
    m.p(
        "A **Continue with Google** button sits below the sign-in form. It requires the installed "
        "app — inside Expo Go or a preview build without Google support you will see “Google "
        "sign-in needs the installed app. Sign in with your username and password here.” Username "
        "and password always work."
    )
    m.callout(
        "note",
        "If Google sign-in reports that the build is not registered with Google, the app is fine "
        "— the facility's Google configuration is incomplete. Sign in with your username and "
        "password and tell your administrator.",
    )

    m.h2("2.5  Forgotten passwords")
    m.callout(
        "limitation",
        "**There is no self-service password reset.** The **Forgot password?** link on the web "
        "login page is not yet connected to anything, and the mobile app has no equivalent. If "
        "you are locked out, ask your Head Doctor to set a new password for you (Chapter 3.9). "
        "If you can still sign in, you can change your own password from the web **Settings** "
        "page — but note the mobile app has no password screen at all.",
    )

    m.h2("2.6  Keeping the account safe")
    m.bullets(
        [
            "Change the password your Head Doctor gave you as soon as you can, if you are on the web.",
            "Changing your own email address signs you out of Google and requires you to verify the new address before you can sign in again.",
            "Changing your password signs out every other device you were signed in on.",
            "**Sign Out** is on the web sidebar, and on the mobile **Profile** screen.",
            "If a member of staff leaves, the Head Doctor should deactivate the account, which blocks sign-in immediately while keeping the care records intact.",
        ]
    )


def chapter_head_doctor(m):
    m.h1("Chapter 3 — Head Doctor (Web Dashboard)")
    m.lead(
        "You are the facility's administrator and its clinical authority. You own the accounts, "
        "the checklist library, the therapy calendar, the medication plans, and the final word on "
        "every AI learning plan."
    )

    m.h2("3.1  At a glance")
    m.table(
        ["You are responsible for", "Where you do it"],
        [
            ["Creating and managing every staff account", "Staff"],
            ["Registering children and keeping records current", "Children"],
            ["Building and maintaining assessment checklists", "Checklists"],
            ["Approving or rejecting AI learning plans", "Assessments"],
            ["Scheduling and closing out therapy sessions", "Therapy Sessions"],
            ["Setting up medication schedules", "Medication Schedules"],
            ["Curating the learning resource library", "Learning Materials"],
            ["Producing reports for review and records", "Reports"],
            ["Facility defaults such as timezone and session length", "Settings"],
        ],
        widths=[3.9, 2.2],
    )

    m.h2("3.2  Your day, start to finish")

    m.h3("First thing in the morning — read the Dashboard")
    m.p(
        "Open **Dashboard**. It greets you by name with today's date and a one-line summary that "
        "changes with the day's actual workload. Work down the page:"
    )
    m.bullets(
        [
            "**Children in care**, **Today's sessions**, **Active profiles**, and **Items needing review** are your four headline numbers.",
            "**Session health** shows the share of sessions completed rather than left hanging.",
            "The **attention feed** is your task list: AI plans awaiting your review, child profiles left inactive, and sessions still marked as merely scheduled. Each entry is clickable and takes you straight to the record. When it is empty it says **All clear**.",
            "**Upcoming sessions** lists the next few appointments with child, time, and teacher.",
        ]
    )
    m.callout(
        "tip",
        "Clear the attention feed first. Every item in it is something another person is waiting "
        "on — usually a teacher who cannot start work until a plan is approved.",
    )

    m.h3("Mid-morning — review the AI learning plans")
    m.p(
        "Go to **Assessments** and filter to **Pending**. These are assessments where a plan has "
        "been generated and is waiting for a clinical decision. Approving one immediately creates "
        "an active therapy plan, so this is the step that turns assessment into treatment."
    )

    m.h3("Through the day — keep the calendar honest")
    m.p(
        "Open **Therapy Sessions**. Schedule new appointments, and as sessions finish, record "
        "their outcome. A calendar full of past sessions still marked `scheduled` makes every "
        "number on your dashboard wrong."
    )

    m.h3("As referrals arrive — register children")
    m.p("Use **Children → Register Child** for each new patient.")

    m.h3("End of day — check notifications and staff")
    m.p(
        "Open the **bell** icon. As a Head Doctor you receive every event in the facility, "
        "including your own actions, so the feed doubles as an audit trail. Handle any new staff "
        "requests in **Staff**."
    )

    m.h3("Weekly")
    m.bullets(
        [
            "Review the **Checklists** library and retire anything out of date.",
            "Add new resources to **Learning Materials** — they feed directly into future AI plans.",
            "Generate a **Facility overview** report in **Reports** for your own records.",
        ]
    )

    m.h2("3.3  Registering and maintaining child records")
    m.h3("Register a child")
    m.steps(
        [
            "Go to **Children** and click **Register Child**.",
            "Fill in **First name** and **Last name** — both required.",
            "Add the **Birth date** and **Sex** (Male, Female, Other, or Prefer not to say).",
            "Choose the **Age band**: 0–3, 4–6, 7–12, or 13–18.",
            "Choose the **Diagnosis** — ASD Level 1, 2 or 3, ADHD, SPD, Speech Delay, Global "
            "Developmental Delay, or Other with your own wording.",
            "Add **Condition notes** with anything the care team should know.",
            "Optionally record the **Caretaker name** and **Relationship**.",
            "Leave **Active in facility registry** ticked for a child currently in care.",
            "Click save. The child appears in the registry with a generated patient ID such as `PT-0001`.",
        ]
    )
    m.callout(
        "warning",
        "The **Caretaker name** and **Relationship** fields are stored as text at the top of the "
        "child's notes. They are a label, not an assignment — the person named there gets no "
        "access to the child and no notifications. See the limitation in Chapter 1.3.",
    )

    m.h3("Find, edit, and open a child")
    m.bullets(
        [
            "Use the **search box** for a name or diagnosis, or the **diagnosis** and **age** filters. The registry shows 8 children per page.",
            "Click the **pencil** to edit a record.",
            "Click the child's row to open the full **profile**, with performance trends over time, domain averages, and tabs for assessments, AI recommendations, medications, materials, and progress.",
            "A ⚠ marker beside a diagnosis flags a Level 3 or severe case for attention.",
        ]
    )

    m.h2("3.4  Building assessment checklists")
    m.p(
        "A checklist is the instrument your clinicians score against. Only you can create one. "
        "The builder is a four-step wizard."
    )
    m.steps(
        [
            "Go to **Checklists** and click to create a new one.",
            "**Define** — give it a title, a category, an age focus, a diagnosis focus, and a purpose.",
            "**AI draft** — optionally have SmartCare draft between 4 and 16 items for you. If the "
            "draft fails you are offered the option to skip AI and add items by hand.",
            "**Review items** — edit, reword, reorder, or delete the drafted items until they read the way you want.",
            "**Publish** — save it. It is now available to every clinician starting an assessment.",
        ]
    )
    m.p("From each checklist card's menu you can also:")
    m.bullets(
        [
            "**View details** to inspect every item.",
            "**Use in assessment** to jump straight into scoring a child against it.",
            "**Deactivate** it, which keeps the history but removes it from the list of checklists a clinician can choose.",
            "**Delete** it permanently, after a confirmation.",
        ]
    )

    m.h2("3.5  Assessments and the AI learning plan")
    m.h3("Submit an assessment")
    m.p("You can score an assessment yourself, exactly as a Psychometrician does:")
    m.steps(
        [
            "Go to **Assessments** and start a new assessment.",
            "Choose the **child** and an **active checklist**.",
            "Set the **severity** — mild, moderate, or severe — and add overall notes.",
            "Score every item from **0 (Not observed)**, **1 (Emerging)**, **2 (Developing)**, to **3 (Consistent)**, adding per-item comments where useful.",
            "Submit. The assessment is finalised and recorded against your name.",
        ]
    )

    m.h3("Generate the AI learning plan")
    m.p(
        "Open the assessment and click **Generate AI recommendation**. SmartCare sends the child's "
        "context, the assessment scores broken down by domain, and your learning-materials catalogue, "
        "and receives a structured plan: a developmental summary, the clinical basis, strengths, focus "
        "areas, two to four priority goals, three to five activities with ordered steps, intervention "
        "strategies, home and school carry-over, and progress monitoring."
    )
    m.callout(
        "note",
        "One plan per assessment. If a plan is already pending or approved, the button locks and "
        "SmartCare refuses a second one. Reject the existing plan first if you want a fresh start.",
    )

    m.h3("Approve or reject — your decision alone")
    m.steps(
        [
            "Open the assessment. Pending plans are marked **“Awaiting professional review — approve to create a therapy plan, or reject to dismiss.”**",
            "Read the full plan on screen.",
            "Add **teacher notes** if you want to guide how it is delivered.",
            "Click **Approve** to accept it, **Accept as modified** from the child profile to accept with your changes, or **Reject** to dismiss it.",
        ]
    )
    m.callout(
        "warning",
        "**Review happens once and cannot be undone.** A second attempt is refused with “This AI "
        "recommendation has already been reviewed and cannot be changed.” Approving or accepting as "
        "modified creates an active therapy plan straight away, titled from the plan's focus areas, "
        "with a weekly session count taken from the recommendation. Rejected plans disappear from "
        "every list.",
    )
    m.callout(
        "note",
        "AI plans deliberately cover learning activities and teaching strategies only. They never "
        "contain diagnoses or medication advice, and every plan carries a caution that a human must "
        "review it. If your facility has no AI service configured, SmartCare produces a detailed "
        "built-in plan instead — it still requires your review.",
    )

    m.h2("3.6  Therapy sessions")
    m.h3("Schedule a session")
    m.steps(
        [
            "Go to **Therapy Sessions**. Use **month**, **week**, or **day** view, and **Today** to come back to now.",
            "Click an empty day — the scheduler opens pre-filled at 10:00 — or use the schedule button.",
            "Choose the **child**, the **teacher**, the **date and time**, and the **duration** (15 to 480 minutes, pre-filled from your facility default).",
            "Optionally attach an existing **therapy plan**.",
            "Save. The appointment appears on the calendar and in everyone's upcoming list.",
        ]
    )

    m.h3("Fill a whole schedule at once with Suggest slots")
    m.steps(
        [
            "Choose the **child**, the **teacher**, a **start date**, **sessions per week** (1 to 7), the **duration**, and which **weekdays** are acceptable (Monday to Friday by default).",
            "SmartCare proposes slots across the next two weeks using 09:00, 10:00, 11:00, then 13:00 to 16:00.",
            "Every suggestion arrives pre-ticked. Untick the ones you do not want, or use select/deselect all.",
            "Click **Schedule selected** to book them in one action.",
        ]
    )

    m.h3("Record the outcome of a session")
    m.steps(
        [
            "Open the session and use the **Record outcome** panel.",
            "Set **Participation**.",
            "Fill in **Observations**, **Outcomes**, and **Intervention notes**.",
            "Save. The session is marked completed and starts counting toward your monthly figures.",
        ]
    )

    m.h3("Reschedule, cancel, delete")
    m.bullets(
        [
            "**Reschedule** — available while a session is still scheduled; edit its date and time.",
            "**Cancel** — keeps the appointment in the calendar history as cancelled and removes it from upcoming lists.",
            "**Delete** — permanently removes the appointment. Use cancel unless the session should never have existed.",
        ]
    )

    m.h2("3.7  Medication schedules")
    m.p("You create the plan; the caretaker records the doses.")
    m.steps(
        [
            "Go to **Medication Schedules** and add a schedule.",
            "Choose the **child**. This cannot be changed afterwards.",
            "Enter the **medicine name**, the **dosage**, and any **instructions**.",
            "Choose how many doses a day, from 1 to 4. SmartCare pre-fills sensible times — one dose at 08:00; two at 08:00 and 20:00; three adding 14:00; four at 08:00, 12:00, 16:00, and 20:00. Adjust them freely.",
            "Tick the **days of the week**. All seven are selected by default.",
            "Save. The schedule now appears in the caretaker's **Today** list on the matching days.",
        ]
    )
    m.bullets(
        [
            "**Deactivate** a schedule to stop it — “Caretakers will no longer see it in today's doses.”",
            "**Reactivate** to bring it back — “Caretakers will see this plan again in today's doses.”",
            "Open a schedule to read its **administration log**: the most recent doses with status, timestamp, and which caretaker recorded each one.",
        ]
    )
    m.callout(
        "limitation",
        "**You cannot record a dose yourself.** Dose logging is restricted to caretakers, and "
        "there is no screen for it on the web. If a dose was missed or logged wrongly, ask the "
        "caretaker to correct it from the app.",
    )

    m.h2("3.8  Learning materials")
    m.steps(
        [
            "Go to **Learning Materials** and add a material.",
            "Give it a **title** — required — and a **description**.",
            "Choose the **type**: worksheet, visual, video, audio, activity, or guide.",
            "Add **tags** to make it findable.",
            "Attach a **file** if you have one: PDF, image, audio, video, or document, up to 10 MB.",
            "Save.",
        ]
    )
    m.callout(
        "tip",
        "A material with no file still earns its place. Up to 30 materials are sent to the AI with "
        "every recommendation request, so a well-titled, well-tagged entry means future plans can "
        "recommend your real resources by name.",
    )
    m.p(
        "You can edit a material, replace its file, or delete it. Deleting warns you that “It will "
        "no longer appear in the catalog or new AI recommendations.” Every signed-in user can browse "
        "the library, so this is the facility's shared shelf."
    )

    m.h2("3.9  Managing staff accounts")
    m.h3("Create an account")
    m.steps(
        [
            "Go to **Staff** and click **Create account**.",
            "Enter the person's **Name**, **Email**, and **Username**.",
            "Set a **Password** and confirm it, or use the **generate password** helper. It must be at least 8 characters with at least one letter and one number.",
            "Choose the **Role**: Head Doctor, Psychometrician, Teacher, Caretaker, or Parent.",
            "Save. SmartCare emails the verification link automatically.",
        ]
    )
    m.callout(
        "warning",
        "If email delivery fails, SmartCare tells you so and gives you the verification link "
        "directly — copy it and send it to the person yourself. Watch for this: the account exists "
        "and looks fine, but the user cannot sign in until that link is opened.",
    )

    m.h3("The other staff actions")
    m.table(
        ["Action", "How", "What happens"],
        [
            ["View an account", "Click the row", "Username, email, registration date, role, whether sign-in is allowed, whether email is confirmed, and the children assigned to them"],
            ["Resend verification", "**Resend verification email** in the view panel", "Appears only for unverified accounts; gives you the link if delivery fails"],
            ["Change role", "The **shield** icon", "Takes effect immediately and is written to the activity log"],
            ["Reset password", "The **key** icon", "Signs the user out everywhere; share the new password securely"],
            ["Deactivate", "**Deactivate** in the access panel", "Blocks sign-in and keeps the record; the user is told “Account is inactive.”"],
            ["Reactivate", "**Reactivate**", "Restores sign-in"],
            ["Delete", "The **trash** icon", "Removes the account from the directory but preserves care records and activity history, and frees the email for reuse"],
        ],
        widths=[1.25, 1.85, 3.0],
    )

    m.h3("The guard rails")
    m.bullets(
        [
            "**You cannot delete your own account.**",
            "**You cannot remove or deactivate the last active Head Doctor** — “The facility must keep at least one active Head Doctor.” This is what stops the facility locking itself out.",
            "Resetting someone's password or deactivating them signs them out of every device.",
        ]
    )
    m.callout(
        "limitation",
        "The **recent admin activity** panel on the Staff page will normally stay empty, because it "
        "reads a field the staff list does not return. The underlying history is being recorded "
        "correctly and is not lost — it simply is not displayed yet.",
    )

    m.h2("3.10  Reports and exports")
    m.steps(
        [
            "Go to **Reports** and choose **Facility overview** or a **Child record**.",
            "For a child record, pick the child.",
            "Generate the preview. It is laid out on a letterhead marked Confidential, showing when it was generated and by whom.",
            "Click **Export PDF** to print it, or **Export CSV** for the data.",
        ]
    )
    m.bullets(
        [
            "**Facility overview** — census, staff by role, AI recommendations by status, therapy session totals, and upcoming sessions.",
            "**Child record** — the child's details and assigned staff, a caseload summary, their latest assessment in full, assessment history, AI recommendations, active therapy plans, upcoming sessions, and medication schedules.",
        ]
    )

    m.h2("3.11  Facility settings")
    m.p("On **Settings**, below your own profile, you alone can set the facility defaults:")
    m.bullets(
        [
            "**Facility name** — also shown in the sidebar.",
            "**Timezone** — used for every due-time calculation.",
            "**Default session minutes** — pre-fills the therapy scheduler.",
            "**Reminder lead minutes** — how far ahead of a session or dose a reminder is raised.",
        ]
    )

    m.h2("3.12  What you cannot do")
    m.bullets(
        [
            "Record a medication dose — caretakers only.",
            "Assign a child to a teacher, caretaker, or parent from the dashboard.",
            "Delete your own account, or leave the facility without an active Head Doctor.",
            "Reverse an AI review decision.",
            "Reset a password by email — you set the new password and pass it on yourself.",
        ]
    )


def chapter_psychometrician(m):
    m.h1("Chapter 4 — Psychometrician (Web Dashboard)")
    m.lead(
        "You are the assessing clinician. Your work is the evidence everything else rests on: you "
        "register children, score them against the facility's checklists, and turn each assessment "
        "into a proposed learning plan for the Head Doctor to decide on."
    )

    m.h2("4.1  At a glance")
    m.table(
        ["You can", "You cannot"],
        [
            ["Register and edit children", "Create, edit, or delete checklists"],
            ["See every child in the facility", "Approve or reject AI learning plans"],
            ["Browse checklists and use them", "Manage staff accounts"],
            ["Submit assessments", "Schedule therapy sessions"],
            ["Generate AI recommendations", "Create medication schedules"],
            ["Export child record reports", "Manage the learning materials library"],
            ["Use notifications, search, and settings", "Export the facility overview report"],
        ],
        widths=[3.05, 3.05],
    )
    m.p(
        "Your sidebar therefore shows **Dashboard**, **Children**, **Checklists**, **Assessments**, "
        "**Reports**, **Settings**, and **Help**. Staff, Therapy, Medication, and Materials are not "
        "yours and are hidden."
    )

    m.h2("4.2  Your day, start to finish")

    m.h3("Start on your dashboard")
    m.p(
        "You sign in directly to **Assessments**, but open **Dashboard** first — it is built around "
        "your own workload, not the facility's."
    )
    m.bullets(
        [
            "**My assessments** — how many you have submitted in total.",
            "**Ready for AI** — assessments you have submitted that have no plan yet. This is your real queue.",
            "**Awaiting review** — plans you generated that are now with the Head Doctor. Nothing for you to do but useful to know.",
            "**Active children** — the size of the facility's caseload.",
        ]
    )
    m.p(
        "The lead line prioritises for you: assessments ready for AI first, then those awaiting "
        "review, then how many you submitted this week. **Start assessment** and **View "
        "submissions** take you straight to work."
    )

    m.h3("Work the assessment queue")
    m.p(
        "Go to **Assessments**. The **only mine** toggle is already switched on for you, so you see "
        "your own submissions. Use the status chips to move between all, pending, and approved. "
        "Anything with no AI plan is your next task."
    )

    m.h3("Assess new children")
    m.p(
        "Register any child who has arrived for assessment, then score them. Give the AI good "
        "material to work with: severity, per-item comments, and thorough notes all end up in the "
        "prompt and shape the quality of the plan."
    )

    m.h3("Generate plans, then hand over")
    m.p(
        "For each completed assessment, generate the AI recommendation and leave it for the Head "
        "Doctor. Your part ends there — the approve and reject buttons are not available to you."
    )

    m.h3("End of day")
    m.p(
        "Check the **bell**. You receive facility-wide activity, so this is where you notice that "
        "a plan you generated has been approved and turned into a therapy plan."
    )

    m.h2("4.3  Registering a child")
    m.p(
        "Identical to the Head Doctor's process — see Chapter 3.3 for the full field-by-field "
        "walkthrough. In short: **Children → Register Child**, fill in the name, birth date, sex, "
        "age band, diagnosis, and condition notes, and save."
    )
    m.callout(
        "note",
        "You see every child in the facility, not only the ones you assessed. Use the search box "
        "and the diagnosis and age filters rather than paging through the registry.",
    )

    m.h2("4.4  Submitting an assessment — the core task")
    m.steps(
        [
            "Go to **Assessments** and start a new assessment. You can also come from a checklist card via **Use in assessment**, which preselects it.",
            "Choose the **child**.",
            "Choose an **active checklist**. Deactivated ones are hidden on purpose.",
            "Set the **severity level**: mild, moderate, or severe.",
            "Add overall **notes** on how the session went and anything that affected the child's performance.",
            "Score every item on the 0–3 scale below, adding a **comment** wherever the number alone would mislead.",
            "Submit. The assessment is finalised against your name and appears in the hub immediately.",
        ]
    )

    m.h3("The scoring scale")
    m.table(
        ["Score", "Meaning", "Use it when"],
        [
            ["0", "Not observed", "The behaviour or skill did not appear at all."],
            ["1", "Emerging", "Occasional signs, heavily prompted or inconsistent."],
            ["2", "Developing", "Present and improving, but not yet reliable."],
            ["3", "Consistent", "Demonstrated reliably and independently."],
        ],
        widths=[0.7, 1.5, 3.9],
    )
    m.callout(
        "tip",
        "Some checklist items carry a **hint** shown as a reviewer cue beside the item. Read it "
        "before scoring — it exists to keep scoring consistent between clinicians.",
    )

    m.h2("4.5  Generating an AI learning plan")
    m.steps(
        [
            "Open the submitted assessment.",
            "Click **Generate AI recommendation**.",
            "Wait for the plan to build, then read it in full.",
            "Leave it. It is now **pending review** and the Head Doctor decides.",
        ]
    )
    m.p("The plan you receive contains:")
    m.bullets(
        [
            "A developmental summary and the clinical basis for it.",
            "The child's strengths, and the focus areas drawn from the weakest scoring domains.",
            "Two to four priority goals, each with a timeframe and a success measure.",
            "Three to five activities with duration, frequency, ordered steps, and a rationale — often citing real materials from the facility library.",
            "Intervention strategies, home and school carry-over, progress monitoring, and a session structure.",
        ]
    )
    m.callout(
        "note",
        "You get one plan per assessment. If the button is locked as **Pending review** or **AI "
        "approved**, a plan already exists. Only a rejected plan can be replaced.",
    )
    m.callout(
        "warning",
        "**You cannot approve your own recommendation.** If you try, SmartCare tells you “Only Head "
        "Doctors can approve or reject AI recommendations here.” This separation is deliberate: the "
        "clinician who assesses is not the one who authorises treatment.",
    )

    m.h2("4.6  Checklists — read and use, not edit")
    m.p(
        "Open **Checklists** to see the library the Head Doctor maintains. You can **View details** "
        "on any checklist and **Use in assessment** to start scoring with it. The empty state says "
        "it plainly: “The Head Doctor maintains these checklists. You can review items here and use "
        "them when starting a new assessment.”"
    )
    m.p(
        "If a checklist is wrong, out of date, or missing an item, tell your Head Doctor — creating "
        "and editing them is their responsibility."
    )

    m.h2("4.7  Child reports")
    m.steps(
        [
            "Go to **Reports**.",
            "The report type is set to **Child record** for you.",
            "Choose the child and generate the preview.",
            "Use **Export PDF** for case review, or **Export CSV** for the data.",
        ]
    )
    m.p(
        "The report gives you the child's details and assigned staff, a caseload summary, the "
        "latest assessment in full, assessment history, AI recommendations, active therapy plans, "
        "upcoming sessions, and medication schedules. The facility overview report is not available "
        "to you."
    )
    m.p(
        "For clinical detail, open the child's **profile** instead: a performance trend line across "
        "every assessment on the 0–3 scale, domain averages, and per-assessment breakdowns."
    )

    m.h2("4.8  Your own account")
    m.p(
        "On **Settings** you can change your name, username, email, and phone; upload or remove a "
        "profile photo; change your password; set notification preferences; and sign out other "
        "devices. Facility defaults on that page are disabled for you."
    )
    m.callout(
        "warning",
        "Changing your own email address clears your verification and unlinks Google. You must open "
        "a fresh verification link before you can sign in again.",
    )


def chapter_teacher(m):
    m.h1("Chapter 5 — Teacher (Mobile App)")
    m.lead(
        "You turn plans into practice. You hold the professional decision on every AI learning plan "
        "for the children in your care, you run their therapy sessions, and you draw on the "
        "facility's resource library to do it."
    )

    m.h2("5.1  At a glance")
    m.table(
        ["Tab", "What it is for"],
        [
            ["**Home**", "Your daily starting point: what needs attention, and your assigned children"],
            ["**Review**", "Approve or reject AI learning plans — your most consequential screen"],
            ["**Therapy**", "The week-by-week session calendar"],
            ["**Materials**", "The searchable learning resource library"],
            ["**Meds**", "See what medication your children are on — read-only"],
        ],
        widths=[1.3, 4.8],
    )
    m.p(
        "The header on every tab carries the notification **bell** with an unread count, and your "
        "**avatar**, which opens your profile."
    )
    m.callout(
        "note",
        "You only ever see children who are assigned to you as their teacher. If a child you work "
        "with is missing, they have not been assigned yet — ask your Head Doctor.",
    )

    m.h2("5.2  Your day, start to finish")

    m.h3("Open the app — check Home")
    m.p(
        "**Home** greets you by name and reads **“Focus on the children who need you today.”** "
        "If any AI plans are waiting, a **Needs attention** card tells you how many. Tap it to go "
        "straight to Review. Below that, **Assigned children** lists everyone in your care with "
        "their diagnosis."
    )

    m.h3("Clear the review queue first")
    m.p(
        "Go to **Review**. Each plan here is blocking a child's therapy from formally starting, and "
        "you are the person who unblocks it. Read and decide before the teaching day begins."
    )

    m.h3("Check today's sessions")
    m.p(
        "Open **Therapy**. It opens on the current week with today highlighted. Tap today to see "
        "your sessions with their times, durations, and any notes."
    )

    m.h3("Prepare with Materials")
    m.p(
        "Before a session, open **Materials** and pull up the worksheets, visuals, videos, or "
        "guides you need. An approved AI plan will often name specific materials — search for them "
        "by title."
    )

    m.h3("Know the medication picture")
    m.p(
        "Glance at **Meds** so you understand what a child is taking and whether today's doses "
        "have been given. You cannot record doses, but a missed dose often explains a difficult "
        "session."
    )

    m.h3("End of day")
    m.p(
        "Check the **bell**. New assessments, progress updates, parent messages, and newly "
        "scheduled sessions all arrive here."
    )

    m.h2("5.3  Reviewing an AI learning plan — your key responsibility")
    m.steps(
        [
            "Open the **Review** tab. The heading tells you how many plans are “awaiting your professional review”.",
            "Read the plan. Each card is labelled **AI learning plan** and shows the child's name and the plan title.",
            "Work through the sections that are present: **Assessment basis**, **Focus areas**, **Priority goals** (with timeframe, success measure, and basis), **Suggested activities** (with rationale and ordered steps), and **Intervention strategies**.",
            "Note the closing caution — “Generated learning-support draft — review carefully before approving.”",
            "Tap **Approve** if the plan is clinically sound and you can deliver it, or **Reject** if it is not appropriate for this child.",
        ]
    )
    m.callout(
        "warning",
        "**This decision is final and cannot be changed.** A second attempt is refused with “This "
        "AI recommendation has already been reviewed and cannot be changed.” Approving also "
        "immediately creates an active therapy plan for the child, named from the plan's focus "
        "areas. If you are unsure, speak to your Head Doctor before tapping either button.",
    )
    m.p(
        "When the queue is clear you will see **No pending reviews** — “When AI suggestions are "
        "ready, they will appear here for your decision.”"
    )

    m.h2("5.4  The therapy calendar")
    m.bullets(
        [
            "The green header shows the **month**, with a **7-day strip** beneath it.",
            "Use the **chevrons** for the previous or next week.",
            "A **dot** under a day means it has sessions. Today is filled in; the day you selected has a white ring.",
            "Tap any day to list its sessions.",
        ]
    )
    m.p("Each session card shows:")
    m.bullets(
        [
            "A **coloured rail** for status — amber for scheduled, green for completed, grey for cancelled.",
            "The **time range**, such as 10:00 AM – 10:45 AM, or **Time TBD**.",
            "The **child's name**, the therapy title, and the **duration** such as 45m or 1h 15m.",
            "Up to two lines of **notes**.",
        ]
    )
    m.callout(
        "limitation",
        "The therapy calendar is **read-only**. You cannot schedule, reschedule, or record the "
        "outcome of a session from the app — ask your Head Doctor, who does this on the web. Note "
        "also that there is no therapy-plan screen: approving an AI plan is the only way you create "
        "one, and it happens automatically.",
    )

    m.h2("5.5  Learning materials")
    m.steps(
        [
            "Open **Materials**. The heading shows how many resources exist.",
            "Type in **Search materials** to match on title, description, or type.",
            "Or filter with the chips — **All** plus every type available.",
            "Tap a card to open it.",
        ]
    )
    m.p("Materials open in a full-screen viewer:")
    m.bullets(
        [
            "**Images** display directly.",
            "**Audio and video** play in a built-in player.",
            "**PDFs** open inline, and there is an external-open button if you prefer another app.",
            "A card marked **Details only** has no file attached — its description is the resource.",
        ]
    )

    m.h2("5.6  Medication visibility")
    m.p(
        "**Meds** is titled with the subtitle **“Visibility for children in your care — caretakers "
        "log doses.”** It has two parts."
    )
    m.bullets(
        [
            "**Daily doses** — a scrollable date strip covering about three weeks either side of "
            "today, centred on today. Each day is tinted by what happened: scheduled, given, "
            "missed, or mixed. Tap a day for a timeline with badges reading **Given**, **Missed**, "
            "**Refused**, **Due today**, **No log**, or **Upcoming**. A **Today** shortcut brings "
            "you back.",
            "**All schedules** — every active regimen with the medicine name, the child, the "
            "dosage, an **Active** or **Paused** badge, the days (shown as **Every day** or "
            "**Weekdays** where that fits), the times, and the instructions.",
        ]
    )
    m.callout(
        "note",
        "**No log** on a past day means a scheduled dose was never recorded. That is worth raising "
        "with the caretaker or your Head Doctor.",
    )

    m.h2("5.7  What you cannot do")
    m.bullets(
        [
            "Record a medication dose — caretakers only.",
            "Schedule, change, or complete a therapy session.",
            "Create or edit medication schedules, materials, or checklists.",
            "Write progress notes or observations — there is no screen for it in the app.",
            "See children who are not assigned to you.",
        ]
    )


def chapter_caretaker(m):
    m.h1("Chapter 6 — Caretaker (Mobile App)")
    m.lead(
        "You are the only person in the entire system who can record that a child was given their "
        "medicine. Every adherence figure a parent or clinician sees comes from what you tap."
    )

    m.h2("6.1  At a glance")
    m.table(
        ["Tab", "What it is for"],
        [
            ["**Today**", "Your working screen: the doses due now, coming up, and already done"],
            ["**Log**", "The history of every dose you have recorded"],
            ["**Children**", "The children assigned to you and their dose load today"],
        ],
        widths=[1.3, 4.8],
    )
    m.callout(
        "warning",
        "Record each dose **at the time you give it**. The timestamp is taken from when you tap, "
        "not from the scheduled time, and it becomes part of the child's clinical record.",
    )

    m.h2("6.2  Your day, start to finish")
    m.p(
        "Your day is the simplest and the most important loop in SmartCare. You will spend almost "
        "all your time on one screen."
    )
    m.steps(
        [
            "Open the app. **Today** shows the date and every dose scheduled for today.",
            "Work the **Due now** section. For each dose, give the medicine, then record it.",
            "Check **Upcoming** so you know what is coming and when.",
            "Watch items move into **Completed** as you record them — that section is your proof of a job done.",
            "Revisit through the day as later dose times arrive.",
            "Before you finish, make sure **Due now** is empty. Anything still sitting there is a dose nobody has accounted for.",
        ]
    )

    m.h2("6.3  Understanding the Today screen")
    m.p("Doses are sorted into three sections, and a section is hidden when it is empty.")
    m.table(
        ["Section", "What is in it"],
        [
            ["**Due now**", "The scheduled time has arrived or passed and nothing has been recorded"],
            ["**Upcoming**", "The scheduled time is still in the future"],
            ["**Completed**", "You have already recorded it as given or skipped"],
        ],
        widths=[1.3, 4.8],
    )
    m.p("Each dose card shows the child, the medicine, the dosage, a status badge, and the scheduled time.")

    m.h3("What the badges mean")
    m.table(
        ["Badge", "Meaning"],
        [
            ["**Due now**", "Ready to be given"],
            ["**Late**", "More than 15 minutes past the scheduled time — deal with this first"],
            ["**Upcoming**", "Not due yet"],
            ["**Given**", "Recorded as taken"],
            ["**Missed** / **Skipped**", "Recorded as not taken"],
        ],
        widths=[1.6, 4.5],
    )
    m.callout(
        "note",
        "A dose stays in **Due now** for as long as it is unrecorded, however late it becomes. It "
        "will not quietly disappear — which is exactly what you want from a medication list.",
    )

    m.h2("6.4  Recording a dose")
    m.steps(
        [
            "Find the dose on **Today**.",
            "Give the medicine to the child as instructed.",
            "Tap **Mark as Given** if the child took it, or **Skipped** if they did not.",
            "The buttons dim briefly while saving, then the card moves to **Completed**.",
        ]
    )
    m.p(
        "Only doses that have not yet been recorded show buttons. Completed cards have none, which "
        "prevents double-recording."
    )
    m.callout(
        "warning",
        "Tap **Skipped** for any dose that was not taken — a refusal, a missed time, or a "
        "clinical instruction to hold it. Leaving it unrecorded is worse than recording that it did "
        "not happen: an unrecorded dose looks like an oversight and shows as **No log** on the "
        "teacher's calendar, while a skipped dose is a fact the team can act on.",
    )
    m.callout(
        "limitation",
        "**A dose cannot be edited or undone once recorded**, and nobody else can correct it for "
        "you — Head Doctors and Psychometricians have no dose-logging screen at all. If you record "
        "something wrongly, tell your Head Doctor immediately so it can be noted.",
    )

    m.h2("6.5  Checking your history")
    m.p(
        "**Log** is titled **Medication log** — “History of doses you have recorded.” Entries are "
        "grouped into **Today** and **Earlier**, each showing the medicine, a colour-coded status "
        "badge, the child's name, and the date. Green is given; red is missed or refused; amber is "
        "skipped or partial."
    )
    m.p("Use it to confirm you recorded something, and to answer questions about a past day.")

    m.h2("6.6  Your children")
    m.p(
        "**Children** is titled with “Children assigned to your care today.” Each card shows the "
        "child's name, age, diagnosis, and either how many doses they have today or **No doses "
        "scheduled today**."
    )
    m.p("Use it at the start of a shift to see the whole picture before you start working through Today.")

    m.h2("6.7  Why a dose might not appear")
    m.p("A schedule only appears on **Today** when all of these are true:")
    m.bullets(
        [
            "The child is **assigned to you** as their caretaker.",
            "The schedule is **active** and has not been paused by the Head Doctor.",
            "**Today is one of the schedule's days** of the week.",
        ]
    )
    m.p(
        "If you expect a dose and it is not there, check with your Head Doctor before giving "
        "anything — a paused schedule usually means a deliberate clinical decision."
    )

    m.h2("6.8  What you cannot do")
    m.bullets(
        [
            "Create, edit, pause, or resume a medication schedule — the Head Doctor owns those.",
            "Change or delete a dose you have already recorded.",
            "See therapy sessions, learning materials, or AI plans — those are the teacher's screens.",
            "See children who are not assigned to you.",
        ]
    )


def chapter_parent(m):
    m.h1("Chapter 7 — Parent or Guardian (Mobile App)")
    m.lead(
        "SmartCare gives you an honest, up-to-date view of your child's care — the milestones they "
        "are reaching, whether medication is being given, and what is scheduled next — and a "
        "direct line back to the team."
    )

    m.h2("7.1  At a glance")
    m.table(
        ["Tab", "What it is for"],
        [
            ["**Progress**", "Your home screen: milestones, adherence, upcoming sessions, and sending updates"],
            ["**Schedule**", "A month calendar of your child's therapy sessions"],
            ["**Profile**", "Your details, notifications, and sign out"],
        ],
        widths=[1.3, 4.8],
    )
    m.callout(
        "note",
        "You only ever see your own children, and only your own messages. Another parent's updates "
        "about a child you share are never shown to you.",
    )

    m.h2("7.2  Your day, start to finish")
    m.p(
        "Most parents use SmartCare as a short daily check-in and a weekly closer read."
    )
    m.steps(
        [
            "Open the app on **Progress** and read the **Care overview** — adherence, milestones this month, and upcoming sessions.",
            "Glance at **Your children** for the newest progress update on each child.",
            "Open **Schedule** to see whether anything is happening today or tomorrow.",
            "Check the **bell** for new updates from the team.",
            "When you have something worth sharing — a good week, a hard night, a reaction to a medicine — tap **Send update**.",
        ]
    )

    m.h2("7.3  The Progress screen")
    m.h3("Care overview")
    m.table(
        ["Metric", "What it means"],
        [
            ["**Medication / adherence**", "The share of recorded doses that were actually given, shown as a ring. It appears only once doses have been recorded."],
            ["**Milestones / this month**", "Progress records the care team has logged in the current calendar month."],
            ["**Therapy / upcoming**", "Sessions scheduled from now onward that have not been cancelled."],
        ],
        widths=[1.9, 4.2],
    )

    m.h3("Charts")
    m.bullets(
        [
            "**Milestones by child** — compares total recorded progress across your children. Shown when there is something to compare.",
            "**6-week progress trend** — milestones recorded per week over the last six weeks, so you can see the direction of travel rather than a single number.",
        ]
    )

    m.h3("Your children")
    m.p(
        "One card per child with their name, age, a milestone count, their diagnosis, and a "
        "**Latest progress** block showing the newest update and its date. A child with nothing "
        "recorded yet reads **No progress recorded yet**."
    )
    m.p("Tap any card to open that child's full history.")

    m.h2("7.4  A child's full history")
    m.p("Tapping a child card opens their own screen.")
    m.bullets(
        [
            "A banner with their name, **age**, **sex**, and diagnosis.",
            "**Care snapshot** — medication adherence, total milestones, and this month's milestones.",
            "The **facts** — birth date, age band, and sex.",
            "**Care notes** — the clinical notes the team keeps on your child.",
            "A switch between **Progress** and **Medication**, each showing how many records it holds.",
        ]
    )
    m.bullets(
        [
            "**Progress** is a timeline of updates, each with a title, a summary, a date, and a milestone badge. Empty, it reads “Progress updates from the care team will appear here.”",
            "**Medication** lists each recorded dose with the medicine, a **Given**, **Missed**, **Refused**, or **Partial** badge, the dosage, when it was given, and which caretaker recorded it.",
        ]
    )

    m.h2("7.5  The therapy schedule")
    m.steps(
        [
            "Open **Schedule**.",
            "If you have more than one child, use the **All** and per-child chips to narrow the calendar.",
            "Read the summary: **This month**, **Upcoming**, and **Completed**.",
            "Move between months with the chevrons, or tap **Today** to come back.",
            "Tap a day to list its sessions.",
        ]
    )
    m.p(
        "Days carry up to three coloured dots, and the legend reads **Scheduled**, **Done**, and "
        "**Cancelled**. Each session shows its time, status, and the child's name. An empty day "
        "reads “Nothing scheduled for this day.”"
    )
    m.callout(
        "limitation",
        "Session **notes and outcomes are not shown to parents**. You can see that a session "
        "happened and that it was completed, but not what was observed in it. Ask your care team "
        "for that detail. You also cannot request, change, or cancel an appointment from the app.",
    )

    m.h2("7.6  Sending a care update")
    m.p(
        "This is your voice in your child's record, and the team is notified when you use it."
    )
    m.steps(
        [
            "On **Progress**, tap **Send update**.",
            "The **Send care update** sheet opens — “Your message goes to the care team.”",
            "If you have more than one child, choose who the update is **About**.",
            "Write your message. The box prompts you with “How is <your child> doing at home?”",
            "Tap **Send update**. It changes to **Sending…** and then your message appears in **Care updates**.",
        ]
    )
    m.p("Your three most recent updates are listed on the Progress screen with their date and child.")
    m.callout(
        "tip",
        "The most useful updates are concrete and recent: how sleep has been, how a new routine is "
        "going, a reaction after a dose, something that worked at home. Teachers and caretakers are "
        "notified, so this genuinely reaches the people doing the daily work.",
    )

    m.h2("7.7  Notifications and your profile")
    m.p(
        "The **bell** and the **Notifications** row on your Profile both open the same list. You "
        "are notified when your child's record changes, when sessions are scheduled or due, when "
        "medication schedules change or a dose is logged, when progress is recorded, and when an "
        "AI plan for your child has been reviewed."
    )
    m.p(
        "**Profile** shows your name, email, role, and how many children are linked to you and how "
        "many updates you have sent, along with **About SmartCare** and **Sign Out**."
    )
    m.callout(
        "limitation",
        "The mobile Profile screen is **read-only**. You cannot change your name, email, photo, or "
        "password, or adjust notification preferences, from the app. Ask your Head Doctor to update "
        "your details or reset your password.",
    )

    m.h2("7.8  What you cannot do")
    m.bullets(
        [
            "Record a medication dose — that is the caretaker's role, and it keeps the record trustworthy.",
            "See or change therapy schedules, assessments, AI plans, or learning materials.",
            "Read session observations and outcomes.",
            "See other parents' updates, or any child not linked to you.",
        ]
    )


def chapter_reference(m):
    m.h1("Chapter 8 — Reference")

    m.h2("8.1  Notifications: how they work")
    m.p(
        "Notifications are how SmartCare keeps five roles in step without anyone sending messages "
        "by hand."
    )
    m.bullets(
        [
            "**They arrive by polling, roughly every 45 seconds**, while the app or dashboard is open. There are no push notifications yet, so nothing arrives while the app is closed.",
            "**Web staff receive every event**, including their own actions, which makes the feed an audit trail.",
            "**Mobile users receive only events about children assigned to them**, and never their own actions.",
            "Tapping an unread notification marks it read. On the web it also jumps you to the record.",
            "**Mark all read** clears the count.",
        ]
    )

    m.h3("Who gets told about what")
    m.table(
        ["When this changes", "These mobile roles are notified"],
        [
            ["A child's record", "Teacher, Caretaker, Parent"],
            ["A therapy session", "Teacher, Caretaker, Parent"],
            ["A therapy plan", "Teacher, Parent"],
            ["A medication schedule", "Caretaker, Teacher, Parent"],
            ["A dose is logged", "Teacher, Parent"],
            ["A progress record", "Teacher, Caretaker, Parent"],
            ["A parent sends an update", "Teacher, Caretaker"],
            ["An AI plan is generated", "Teacher (it is their decision)"],
            ["An AI plan is reviewed", "Parent, Caretaker"],
            ["An assessment", "Teacher, Parent"],
            ["A learning material is added", "All Teachers, Caretakers, and Parents"],
        ],
        widths=[2.5, 3.6],
    )

    m.h3("Due reminders")
    m.p("Two reminders are generated automatically, using your facility's timezone and reminder lead time:")
    m.bullets(
        [
            "**Therapy session is due** — “<Child> has a session at 2:00 PM.”",
            "**Medication time reached** — “<Child> is due for Melatonin at 8:00 PM.”",
        ]
    )
    m.callout(
        "limitation",
        "Reminders are **calculated when somebody opens their notifications**, not by a background "
        "scheduler. If nobody opens SmartCare, no reminder is raised. Treat them as a helpful "
        "prompt, not a guaranteed alarm — the caretaker's **Today** screen remains the reliable "
        "source for what is due. Per-user notification preferences also exist, but only the web "
        "dashboard can change them.",
    )

    m.h2("8.2  Test accounts")
    m.p(
        "For training and testing on a seeded environment. These are demonstration accounts and "
        "must never exist in a live facility."
    )
    m.h3("Purpose-built mobile accounts")
    m.table(
        ["Role", "Username", "Password"],
        [
            ["Teacher", "`mobile_teacher`", "`password`"],
            ["Caretaker", "`mobile_caretaker`", "`password`"],
            ["Parent", "`mobile_parent`", "`password`"],
        ],
        widths=[1.5, 2.6, 2.0],
    )
    m.p(
        "All three are linked to the same two demo children — Lucas Mendoza (age band 7, autism "
        "spectrum, moderate support) and Emma Torres (age band 6, speech and language delay) — so "
        "you can watch one action ripple across all three roles."
    )

    m.h3("Additional sample accounts")
    m.table(
        ["Role", "Usernames", "Password"],
        [
            ["Teacher", "`teacher`, `teacher2`", "`password`"],
            ["Caretaker", "`caretaker`, `caretaker2`", "`password`"],
            ["Parent", "`parent`, `parent2`", "`password`"],
            ["Head Doctor", "`headdoctor`", "`password`"],
            ["Psychometrician", "`psycho`, `psycho2`", "`password`"],
        ],
        widths=[1.5, 2.6, 2.0],
    )
    m.callout(
        "tip",
        "The `2` accounts have narrower assignments than the primaries, which makes them the right "
        "way to prove the “you only see your assigned children” rule really works.",
    )
    m.callout(
        "note",
        "Every seeded account is pre-verified, so none of them can demonstrate the first-login "
        "verification window. To see that, have a Head Doctor create a brand-new account and try "
        "to sign in before opening the emailed link.",
    )

    m.h2("8.3  Messages you may see, and what to do")
    m.table(
        ["Message", "What it means", "What to do"],
        [
            ["“Invalid credentials.”", "Wrong username or password", "Check both. Ask your Head Doctor for a reset."],
            ["“Account is inactive.”", "Your account was deactivated", "Ask your Head Doctor to reactivate it."],
            ["“We already sent a verification link to…”", "Your email is not verified yet", "Open the emailed link, or resend it."],
            ["“This account is for the SmartCare mobile app…”", "A mobile role tried the web", "Use the mobile app instead."],
            ["“This account is for the web dashboard…”", "A web role tried the mobile app", "Use the web dashboard instead."],
            ["“No SmartCare account is registered for this Google email.”", "Google sign-in for an unknown address", "Ask your Head Doctor to create your account first."],
            ["“Too many requests. Wait a minute…”", "More than 5 resends in a minute", "Wait a minute, then try once."],
            ["“This build is not registered with Google.”", "The facility's Google setup is incomplete", "Sign in with username and password; tell your administrator."],
            ["“This AI recommendation has already been reviewed…”", "The plan was already approved or rejected", "Nothing — the decision stands."],
            ["“Only Head Doctors can approve or reject…”", "A Psychometrician tried to review", "Ask a Head Doctor to decide."],
            ["“The facility must keep at least one active Head Doctor.”", "You tried to remove the last one", "Promote another Head Doctor first."],
            ["“You cannot delete your own account.”", "Self-deletion attempt", "Ask another Head Doctor."],
            ["“Cannot reach SmartCare server…”", "The app cannot reach the backend", "Check your connection; if it persists, contact your administrator."],
        ],
        widths=[2.05, 2.05, 2.0],
    )

    m.h2("8.4  Known limitations at a glance")
    m.p(
        "Collected here so nobody wastes time hunting for a feature that is not there yet. Each is "
        "explained in context earlier in the manual."
    )
    m.table(
        ["Limitation", "Work around it by"],
        [
            ["No self-service password reset; **Forgot password?** is inactive", "Asking a Head Doctor to set a new password"],
            ["Children cannot be assigned to staff or parents from the dashboard", "Having an administrator make assignments directly, until a screen exists"],
            ["The **Caretaker name** field on child registration grants no access", "Treating it as a label only, and arranging a real assignment"],
            ["The mobile Profile screen is read-only", "Asking a Head Doctor to change details or reset a password"],
            ["Teachers cannot write progress notes or observations in the app", "Recording them through a Head Doctor on the web"],
            ["Doses cannot be corrected once recorded", "Telling a Head Doctor so the error is documented"],
            ["Parents cannot see session observations", "Asking the care team directly"],
            ["Due reminders only appear when somebody opens notifications", "Relying on the caretaker's **Today** screen for what is due"],
            ["No push notifications", "Opening the app to check"],
            ["The Staff **recent activity** panel stays empty", "Nothing — history is recorded, just not displayed"],
            ["**Remember me** on the web login does nothing", "Ignoring it"],
        ],
        widths=[3.4, 2.7],
    )

    m.h2("8.5  Glossary")
    m.table(
        ["Term", "Meaning"],
        [
            ["**Age band**", "The developmental bracket a child is grouped into: 0–3, 4–6, 7–12, or 13–18."],
            ["**Assessment**", "A scored evaluation of one child against one checklist, on the 0–3 scale."],
            ["**Checklist**", "The reusable instrument of items a clinician scores against. Head Doctors maintain these."],
            ["**AI recommendation / AI learning plan**", "A structured, generated learning plan proposed from an assessment. Requires human approval."],
            ["**Therapy plan**", "The active plan created automatically when an AI recommendation is approved."],
            ["**Therapy session**", "A single scheduled appointment for a child with a teacher."],
            ["**Medication schedule**", "The standing instruction for a medicine: dosage, times of day, and days of the week."],
            ["**Dose log**", "The record that one dose was given, missed, refused, or partial. Only caretakers create these."],
            ["**Progress record**", "A milestone or update logged by the care team, shown to parents as a milestone."],
            ["**Care update / parent feedback**", "A message a parent sends to the care team."],
            ["**Assignment**", "The link between a child and a teacher, caretaker, or parent. It decides who sees the child."],
            ["**Severity level**", "The clinician's overall judgement on an assessment: mild, moderate, or severe."],
        ],
        widths=[1.9, 4.2],
    )

    m.h2("8.6  Getting help")
    m.table(
        ["If you need to…", "Ask"],
        [
            ["Get an account, or fix a locked or inactive one", "Your Head Doctor"],
            ["Be assigned to a child, or have a child assigned to you", "Your Head Doctor"],
            ["Change a therapy schedule or a medication plan", "Your Head Doctor"],
            ["Correct a dose you logged wrongly", "Your Head Doctor, straight away"],
            ["Understand or challenge an assessment", "Your Psychometrician or Head Doctor"],
            ["Get a checklist changed", "Your Head Doctor"],
            ["Fix Google sign-in, or a server that cannot be reached", "Your system administrator"],
        ],
        widths=[3.4, 2.7],
    )
    m.p(
        "Head Doctors and Psychometricians also have a **Help** section inside the web dashboard "
        "with a staff manual available at any time."
    )


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def main():
    doc = Document()
    build_styles(doc)

    section = doc.sections[0]
    section.page_width = Inches(8.5)
    section.page_height = Inches(11)
    section.left_margin = Inches(1.0)
    section.right_margin = Inches(1.0)
    section.top_margin = Inches(0.9)
    section.bottom_margin = Inches(0.9)

    m = Manual(doc)

    cover(m, doc)
    toc(m, doc)
    how_to_use(m)
    chapter_overview(m)
    chapter_access(m)
    chapter_head_doctor(m)
    chapter_psychometrician(m)
    chapter_teacher(m)
    chapter_caretaker(m)
    chapter_parent(m)
    chapter_reference(m)

    page_footer(doc.sections[0], doc)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    doc.save(OUT)
    print(f"Wrote {OUT}")
    print(f"Size: {OUT.stat().st_size / 1024:.0f} KB")


if __name__ == "__main__":
    main()
