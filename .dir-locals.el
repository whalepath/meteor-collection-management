;; This file sets emacs variables for the project/directory

; nil means applies to every mode; wrap lines to 100 chars
((nil . ((fill-column . 100)
         ; when using fiplr fuzzy project find, ignore these
         (fiplr-ignored-globs . ((directories (".meteor" ".build"))
                                 (files ("*.jpg" ".png"))))))
 (js2-mode . ((js2-basic-offset . 4)
              ; allow indenting to correct level
              (js2-bounce-indent-p . t)
              ; wrap lines to 100 chars
              (fill-column . 100)))
 (html-mode . ((sgml-basic-offset . 4))))
